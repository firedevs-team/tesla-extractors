import axios from 'axios';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import os from 'os';
import { execSync } from 'child_process';

const SOURCE_URL = `https://jaia-jp.org/ja/stats/stats-new-car-ja/?post_year={YEAR}`;

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'japan'],
      source: 'jaia',
      fileext: 'xls',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Obtengo el html de la página que contiene los documentos
    const response = await axios.get(
      SOURCE_URL.replace('{YEAR}', year.toString())
    );
    const $ = cheerio.load(response.data);

    // En la página hay dos tablas, me quedon la segunda
    const tables = Array.from($('.lst_stats3'));
    if (tables.length !== 2) {
      throw new Error('Unexpected number of tables');
    }

    // Encuentro el link a descargar
    let downloadLink: string = null;
    const table = tables[1];
    const rows = Array.from($(table).find('tr'));
    for (const row of rows) {
      const rowHeader = $(row).find('th').text().trim();
      if (rowHeader === `${year}年${month}月`) {
        const tds = Array.from($(row).find('td'));
        downloadLink = $(tds[0]).find('a').attr('href');
        break;
      }
    }

    // Informo que los datos aún no están publicados
    if (downloadLink === null) {
      return null;
    }

    // Descargo el archivo
    const fileContent = await axios(downloadLink, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la tercera hoja
    const sheet = workbook.Sheets[workbook.SheetNames[2]];
    const cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Me quedo con las celdas de la tabla
    const startPos = cells.findIndex((cell) => cell.data.v === 'c/d%');
    const endPos = cells.findIndex((cell) => cell.data.w === '小　計');
    const tableCells = cells.slice(startPos + 1, endPos);

    // Validos los datos con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess(
          (val: string) => val.trim().toUpperCase().replace(/\s+/g, '_'),
          z.string()
        ),
        registrations: z.number().int(),
      })
      .strict();

    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const cell of tableCells) {
      if (cell.key.startsWith('A')) {
        const brand = cell.data.v;

        const rowIndex = cell.key.substring(1);
        const regsCell = tableCells.find((cell) => cell.key === `B${rowIndex}`);
        let regs = 0;
        if (regsCell) {
          regs = regsCell.data.v as number;
        }

        const parsed = Schema.parse({
          year,
          month,
          brand,
          registrations: regs,
        });
        registrations.push(parsed);
      }
    }

    return [
      {
        name: 'registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {
    // const dateId = new MonthDateId(2023, 1);
    // const result = await this.download(dateId);
    // if (result === null) {
    //   console.log('No data available yet');
    //   return;
    // }

    // const pathFile = path.join(this.downloadsPath, `${dateId.toString()}.xls`);
    // await writeFile(pathFile, result);
    // console.log(`File saved at ${pathFile}`);

    // const dateId = new MonthDateId(2024, 10);
    // const filePath = path.join(this.downloadsPath, `${dateId.toString()}.xls`);
    // const fileData = await readFile(filePath);
    // await this.transform(dateId, { path: filePath, data: fileData });

    await this.reindex();
  }
}

export default new Extractor();
