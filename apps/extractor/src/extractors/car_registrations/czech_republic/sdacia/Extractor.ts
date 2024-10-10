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

const SOURCE_URL =
  'https://www.sda-cia.cz/repository-volnedostupna?m=0&lang=EN&y=';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'czech_republic'],
      source: 'sdacia',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const response = await axios.get(`${SOURCE_URL}${year}`);
    const $ = cheerio.load(response.data);

    const links = $('table table a');

    // Encuentro el link a descargar
    let link: string | null = null;
    let textToFind = `${year}-${month}.mesicni.F.EN.xlsx`;
    links.each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim().replace(/\t$/, '');

      if (text === textToFind) {
        link = `https://www.sda-cia.cz/${href}`;
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
    const [byBrand, byModel] = await Promise.all([
      this.getRegistrationsByBrand(dateId, fileData),
      this.getRegistrationsByModel(dateId, fileData),
    ]);

    return [byBrand, byModel];
  }

  async test() {
    // await this.reindex();
  }

  private getRegistrationsByBrand = async (
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput> => {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la primera hoja
    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Encuento la posicion de la celda
    // con el key "A6" en esa posición
    // está el primer elemento de la tabla
    const startPos = cells.findIndex((cell) => cell.key === 'A6');

    // Encuentro la posición de la celda
    // que tenga el siguiente texto
    // "Total other non members CIA"
    // este sería el fin de la tabla
    // no se incluye en la tabla
    const endPos = cells.findIndex(
      (cell) => cell.data.w === 'Total other non members CIA'
    );

    // Me quedo con las celdas que están
    // entre startPos y endPos
    cells = cells.slice(startPos, endPos);

    // Extraigo los datos de la tabla
    let raw: object[] = [];
    for (let i = 0; i < cells.length; i += 9) {
      const brand = cells[i].data.v;
      const registrations = cells[i + 1].data.v;
      const market_share = cells[i + 2].data.v;

      raw.push({ brand, registrations, market_share });
    }

    // Valido la data
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        registrations: z.number().int(),
        market_share: z.number().transform((val) => val * 100),
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
      name: 'registrations_by_brand',
      data: registrations,
    };
  };

  private getRegistrationsByModel = async (
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput> => {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la hoja con el nombre
    // "PC types month"
    const sheetName = workbook.SheetNames.find((name) =>
      name.toUpperCase().includes('PC TYPES MONTH')
    );

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Encuento la posicion de la celda
    // con el key "A6" en esa posición
    // está el primer elemento de la tabla
    const startPos = cells.findIndex((cell) => cell.key === 'A6');

    // Encuentro la posición de la celda
    // que tenga el siguiente texto
    // "Type not found"
    // este sería el fin de la tabla
    // no se incluye en la tabla
    const endPos = cells.findIndex(
      (cell) => cell.data.w?.toUpperCase() === 'TYPE NOT FOUND'
    );

    // Me quedo con las celdas que están
    // entre startPos y endPos
    cells = cells.slice(startPos, endPos);

    // Extraigo los datos de la tabla
    let raw: object[] = [];
    for (let i = 0; i < cells.length; i += 9) {
      const model = cells[i].data.v;
      const registrations = cells[i + 1].data.v;
      const market_share = cells[i + 2].data.v;

      raw.push({ model, registrations, market_share });
    }

    // Valido la data
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.string().trim().toUpperCase(),
        registrations: z.number().int(),
        market_share: z.number().transform((val) => val * 100),
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
      name: 'registrations_by_model',
      data: registrations,
    };
  };
}

export default new Extractor();
