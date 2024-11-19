import axios from 'axios';
import * as cheerio from 'cheerio';
import PDFParser, { Output, Page } from 'pdf2json';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.apia.ro/comunicate-de-presa';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'romania'],
      source: 'apia',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descargo la página donde están los comunicados
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    // Creo el texto de fecha esperado
    const MONTH_MAP = {
      1: 'IANUARIE',
      2: 'FEBRUARIE',
      3: 'MARTIE',
      4: 'APRILIE',
      5: 'MAI',
      6: 'IUNIE',
      7: 'IULIE',
      8: 'AUGUST',
      9: 'SEPTEMBRIE',
      10: 'OCTOMBRIE',
      11: 'NOIEMBRIE',
      12: 'DECEMBRIE',
    };
    const expectedText = `${MONTH_MAP[month]} ${year}`;

    // Eccuento la url de descarg
    let downloadUrl: string = null;
    const rows = Array.from($('.table tbody tr'));
    for (const row of rows) {
      const tds = $(row).find('td');

      // Hay un caso en que el row está vacio
      if (tds.length !== 2) {
        continue;
      }

      const text = $(tds[0]).text().trim().toUpperCase();
      if (text === expectedText) {
        downloadUrl = $(tds[1]).find('a').attr('href');
        break;
      }
    }

    // Informo que no hay datos publicados aún
    if (downloadUrl === null) {
      return null;
    }

    // Descargo el archivo
    const fileContent = await axios(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    // Este código solo soporta la versiones nuevas del pdf
    // La demás data se agrega a mano (chatgpt/images) usando _other_data.json
    if (year < 2023 || (year === 2024 && month < 3)) {
      throw new Error('Older versions not supported');
    }

    // Convierto el pdf a json
    const pdfJSON = await new Promise<Output>((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataError', (errData) =>
        reject(errData.parserError)
      );

      pdfParser.on('pdfParser_dataReady', async (pdfData) => {
        resolve(pdfData);
      });

      pdfParser.loadPDF(fileData.path);
    });

    // Encuentro la página donde está la tabla de "Top Marcas Eléctricas"
    let page: Page = null;
    for (const _page of pdfJSON.Pages) {
      const match = _page.Texts.find((text) => {
        return decodeURIComponent(text.R[0].T).trim() === 'Top Mărci';
      });
      if (match) {
        page = _page;
        break;
      }
    }

    // Siempre debe estar la tabla
    if (page === null) {
      throw new Error('Table not found');
    }

    // Trabajo con los textos objs
    const texts = page.Texts;

    // Me quedo con los textos que tienen la data
    let textData = [...texts];

    // Quito parte antes
    let foundFirst = false;
    let startIndex = textData.findIndex((text) => {
      if (
        decodeURIComponent(text.R[0].T).trim().toUpperCase() === 'FULL HYBRID'
      ) {
        foundFirst = true;
      }

      if (
        foundFirst &&
        decodeURIComponent(text.R[0].T).trim().toUpperCase() === 'VAR%'
      ) {
        return true;
      }

      return false;
    });
    if (startIndex === -1) {
      throw new Error('Start index not found');
    }
    textData = textData.slice(startIndex + 1);

    // Quito parte despues
    const endIndex = textData.findIndex((text) =>
      decodeURIComponent(text.R[0].T).trim().toUpperCase().startsWith('TOTAL')
    );
    if (endIndex === -1) {
      throw new Error('End index not found');
    }
    textData = textData.slice(0, endIndex);

    // Obtengo los valores dentro de la tabla
    const values = textData
      .reduce((acc, text) => {
        return acc + decodeURIComponent(text.R[0].T).toUpperCase() + '';
      }, '')
      .replace('ALTE MĂRCI', 'OTHERS')
      .split(/\s+/)
      .filter((part) => part !== '');

    // Schema zod
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
        ytd_registrations: z.preprocess((val: string) => {
          return parseInt(val.trim());
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    // Valido con zod
    const registrations: Registrations[] = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      // Si el value es un texto es una brand
      if (/^[A-Z]/.test(value)) {
        const parsed = Schema.parse({
          year,
          month,
          brand: value,
          ytd_registrations: values[i + 1],
        });

        registrations.push(parsed);
      }
    }

    return [
      {
        name: 'top_ytd_bev_registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
