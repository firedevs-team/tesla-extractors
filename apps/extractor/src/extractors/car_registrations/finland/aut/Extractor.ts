import z from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

import os from 'os';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

const SOURCE_URL =
  'https://www.aut.fi/en/statistics/new_registrations/monthly/';
const MONTH_MAP = {
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
};

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'finland'],
      source: 'aut',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const response = await axios.get(`${SOURCE_URL}${year}`);
    const $ = cheerio.load(response.data);

    // Obtengo los links elements
    const linkElements = $('table .filesystemcol_name a');

    // Encuentro el link a descargar
    let link: string | null = null;
    const expected = `${MONTH_MAP[month]} ${year}`;
    linkElements.each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();

      if (text === expected) {
        link = `https://www.aut.fi/${href}`;
      }
    });

    // Informo que los datos aún no están publicados
    if (!link) {
      return null;
    }

    const fileContent = await axios(link, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const outputs = await Promise.all([
      this.getTop30RegistrationsByBrand(dateId, fileData),
      this.getTop30RegistrationsByModel(dateId, fileData),
    ]);

    return outputs;
  }

  async debug() {}

  private async getTop30RegistrationsByBrand(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Busco la hoja con nombre 'Pc 30 makes'
    const sheetName = 'Pc 30 makes';
    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    let totalColumns = 9;
    if ([2023, 2025].includes(year) && month === 1) {
      totalColumns = 7;
    }

    // Encuento la posicion de la celda
    // que tenga el value "1." en esa posición
    // está el primer elemento de la tabla
    const startPos = cells.findIndex((cell) => cell.data.v === '1.');

    // La posicion final es la última celda index
    // de la tabla y se le suma el total de columnas - 1
    const indexCells = cells.filter((cell) => /^\d{1,2}\.$/.test(cell.data.w));
    const endKey = indexCells[indexCells.length - 1].key;
    const endPos =
      cells.findIndex((cell) => cell.key === endKey) + (totalColumns - 1);

    // Me quedo con las celdas que están
    // entre startPos y endPos
    cells = cells.slice(startPos, endPos + 1);

    // Extraigo los datos de la tabla
    let raw: object[] = [];
    for (let i = 0; i < cells.length; i += totalColumns) {
      const brand = cells[i + 1].data.v;
      const registrations = cells[i + 2].data.v;
      const market_share = cells[i + 3].data.v;

      raw.push({ brand, registrations, market_share });
    }

    // Elimino items donde registrations es "."
    // Esto pasa en el year 2023 y month 11
    if (year === 2023 && month === 11) {
      raw = raw.filter((item) => item['registrations'] !== '.');
    }

    // Valido la data
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        registrations: z.number().int(),
        market_share: z.number(),
      })
      .strict();

    const registrations: object[] = [];
    for (const item of raw) {
      const parsed = Schema.parse({
        year,
        month,
        ...item,
      });
      registrations.push(parsed);
    }

    return {
      name: 'top_30_registrations_by_brand',
      data: registrations,
    };
  }

  private async getTop30RegistrationsByModel(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Busco la hoja con nombre 'Pc 30 models'
    const sheetName = 'Pc 30 models';
    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    let totalColumns = 9;
    if ([2023, 2025].includes(year) && month === 1) {
      totalColumns = 7;
    }

    // Encuento la posicion de la celda
    // que tenga el value "1." en esa posición
    // está el primer elemento de la tabla
    const startPos = cells.findIndex((cell) => cell.data.v === '1.');

    // La posicion final es la última celda index
    // de la tabla y se le suma el total de columnas - 1
    const indexCells = cells.filter((cell) => /^\d{1,2}\.$/.test(cell.data.w));
    const endKey = indexCells[indexCells.length - 1].key;
    const endPos =
      cells.findIndex((cell) => cell.key === endKey) + (totalColumns - 1);

    // Me quedo con las celdas que están
    // entre startPos y endPos
    cells = cells.slice(startPos, endPos + 1);

    // Extraigo los datos de la tabla
    let raw: object[] = [];
    for (let i = 0; i < cells.length; i += totalColumns) {
      const model = cells[i + 1].data.v;
      const registrations = cells[i + 2].data.v;
      const market_share = cells[i + 3].data.v;

      raw.push({ model, registrations, market_share });
    }

    // Valido la data
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z
          .string()
          .trim()
          .toUpperCase()
          .transform((val) => val.replace(/\s+/g, '_')),
        registrations: z.number().int(),
        market_share: z.number(),
      })
      .strict();

    const registrations: object[] = [];
    for (const item of raw) {
      const parsed = Schema.parse({
        year,
        month,
        ...item,
      });
      registrations.push(parsed);
    }

    return {
      name: 'top_30_registrations_by_model',
      data: registrations,
    };
  }
}

export default new Extractor();
