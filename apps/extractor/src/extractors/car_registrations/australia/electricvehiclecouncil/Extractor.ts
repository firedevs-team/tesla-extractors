import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL =
  'https://electricvehiclecouncil.com.au/wp-content/uploads/{YEAR}/{MONTH}';
const MONTH_MAP = {
  1: 'JANUARY',
  2: 'FEBRUARY',
  3: 'MARCH',
  4: 'APRIL',
  5: 'MAY',
  6: 'JUNE',
  7: 'JULY',
  8: 'AUGUST',
  9: 'SEPTEMBER',
  10: 'OCTOBER',
  11: 'NOVEMBER',
  12: 'DECEMBER',
};

interface Cell {
  key: string;
  data: CellObject;
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'australia'],
      source: 'electricvehiclecouncil',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // La url tiene la fecha de publicación
    // que siempre es el mes siguiente
    const publishDate = new Date(year, month - 1);
    publishDate.setMonth(publishDate.getMonth() + 1);
    const publishYear = publishDate.getFullYear();
    const publishMonth = publishDate.getMonth() + 1;
    const sourceURL = SOURCE_URL.replace(
      '{YEAR}',
      publishYear.toString()
    ).replace('{MONTH}', publishMonth.toString());

    let $: cheerio.CheerioAPI;
    try {
      // Descargo la pagina principal
      const response = await axios.get(sourceURL);
      $ = cheerio.load(response.data);
    } catch (error) {
      // Si me da un 404 es porque no hay datos
      // Informo que los datos no están publicados aún
      if ((error as AxiosError).status === 404) {
        return null;
      }

      throw error;
    }

    // Creo el texto del link esperado
    const MONTH_MAP = {
      1: 'JAN',
      2: 'FEB',
      3: 'MAR',
      4: 'APR',
      5: 'MAY',
      6: 'JUN',
      7: 'JUL',
      8: 'AUG',
      9: 'SEP',
      10: 'OCT',
      11: 'NOV',
      12: 'DEC',
    };
    const expectedYear = year.toString().slice(-2);
    const textExpected = `EVC-Vehicle-Sales-Report-${MONTH_MAP[month]}${expectedYear}-Public.xlsx`;

    // Encuentro la url a descargar
    let downloadUrl: string = null;
    const links = Array.from($('#table-content td a'));

    // Este es un caso donde la SOURCE_URL está pero no tiene contenido
    // en este caso informo que no hay datos aún publicados
    // se q la pagina esta vacia pq solo tiene el link de volver atrás
    if (links.length === 1) {
      return null;
    }

    for (const link of links) {
      const text = $(link).text();
      if (text === textExpected) {
        downloadUrl = $(link).attr('href');
        break;
      }
    }

    // Si no está el link es pq hay un error
    if (downloadUrl === null) {
      console.debug({
        sourceURL,
      });
      throw new Error('Link not found');
    }

    // Completo la url
    downloadUrl = `https://electricvehiclecouncil.com.au${downloadUrl}`;

    // Descargo el archivo
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return response.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    // Cargo el archivo xlsx
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la segunda hoja
    const sheet = workbook.Sheets[workbook.SheetNames[1]];
    const cells: Cell[] = Object.keys(sheet).map((key) => ({
      key,
      data: sheet[key],
    }));

    // Elimino el header, para esto encuentro la ultima celda
    // del header que es la que tiene el texto 'Brand'
    // en la version 2024_11 en adelante el texto es 'State'
    let lastHeaderText = 'Brand';
    if (dateId.greaterOrEqualThan(new MonthDateId(2024, 11))) {
      lastHeaderText = 'State';
    }
    const startIndex = cells.findIndex(
      (cell) => cell.data.v === lastHeaderText
    );
    if (startIndex === -1) {
      throw new Error('Start index not found');
    }
    const cellsData = cells.slice(startIndex + 1);

    // Convierto las celdas en una tabla de n columnas
    // La tabla siempre tuvo 4 columnas desde sus inicios
    // pero de la version 2024_11 en adelante tiene 5 columnas
    let totalColumns = 4;
    if (dateId.greaterOrEqualThan(new MonthDateId(2024, 11))) {
      totalColumns = 5;
    }
    let table: Cell[][] = [];
    let currentRow: Cell[] = [];
    for (let i = 0; i < cellsData.length; i++) {
      if (currentRow.length === totalColumns) {
        table.push(currentRow);
        currentRow = [];
      }
      currentRow.push(cellsData[i]);
    }

    // Filtro para quedarme con los datos del mes
    // En la versiones anteriores el mes viene como texto
    // ejemplo 'JANUARY', 'FEBRUARY', etc, pero en la version 2024_11
    // viene como un número entero desde 1 de enero de 1900.
    const monthTable = table.filter((row) => {
      if (dateId.greaterOrEqualThan(new MonthDateId(2024, 11))) {
        // El número serial lo convierto a year y month
        // y lo comparo con el year y month esperado
        const baseDate = new Date(1900, 0, 1);
        const adjustedSerial = (row[0].data.v as number) - 2;
        const date = new Date(
          baseDate.getTime() + adjustedSerial * 24 * 60 * 60 * 1000
        );
        const serialYear = date.getFullYear();
        const serialMonth = date.getMonth() + 1;
        return serialYear === year && serialMonth === month;
      }

      return row[0].data.v === MONTH_MAP[month];
    });

    return [
      {
        name: 'registrations_by_model',
        data: this.getRegistrationsByModel(dateId, monthTable),
      },
      {
        name: 'registrations_by_brand',
        data: this.getRegistrationsByBrand(dateId, monthTable),
      },
    ];
  }

  async debug() {}

  private getRegistrationsByModel(dateId: MonthDateId, table: Cell[][]) {
    const { year, month } = dateId;
    let brandIndex = 3;
    let modelIndex = 2;
    if (dateId.greaterOrEqualThan(new MonthDateId(2024, 11))) {
      brandIndex = 2;
      modelIndex = 3;
    }

    // Unifico la data por modelo
    const data: {
      [key: string]: { brand: string; model: string; registrations: number };
    } = {};
    for (const row of table) {
      const key = (row[modelIndex].data.v + '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
      if (!data[key]) {
        data[key] = {
          brand: row[brandIndex].data.v as string,
          model: row[modelIndex].data.v as string,
          registrations: 0,
        };
      }
      data[key].registrations++;
    }

    // Valido los datos con zod
    const strType = z.preprocess((val: string) => {
      return val.trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
    }, z.string());
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: strType,
        model: strType,
        registrations: z.number().int(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const item of Object.values(data)) {
      const parsed = Schema.parse({
        year,
        month,
        brand: item.brand,
        model: item.model,
        registrations: item.registrations,
      });

      registrations.push(parsed);
    }

    return registrations;
  }

  private getRegistrationsByBrand(dateId: MonthDateId, table: Cell[][]) {
    const { year, month } = dateId;
    let brandIndex = 3;
    if (dateId.greaterOrEqualThan(new MonthDateId(2024, 11))) {
      brandIndex = 2;
    }

    // Unifico la data por modelo
    const data: {
      [key: string]: { brand: string; registrations: number };
    } = {};
    for (const row of table) {
      const key = (row[brandIndex].data.v + '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
      if (!data[key]) {
        data[key] = {
          brand: row[brandIndex].data.v as string,
          registrations: 0,
        };
      }
      data[key].registrations++;
    }

    // Valido los datos con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess((val: string) => {
          return val
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        registrations: z.number().int(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const item of Object.values(data)) {
      const parsed = Schema.parse({
        year,
        month,
        brand: item.brand,
        registrations: item.registrations,
      });

      registrations.push(parsed);
    }

    return registrations;
  }
}

export default new Extractor();
