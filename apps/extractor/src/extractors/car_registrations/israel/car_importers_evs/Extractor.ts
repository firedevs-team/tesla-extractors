import axios from 'axios';
import * as cheerio from 'cheerio';
import PDFParser, { Output, Text } from 'pdf2json';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.car-importers.org.il/Rishuy_en/private';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'israel'],
      source: 'car_importers_evs',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    // Encuentro el link a descargar
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
    const expectedText = `${MONTH_MAP[month]} ${year} - ELECT`;

    let downloadURL: string = null;
    const containers = Array.from($('.one_month'));
    if (containers.length === 0) {
      throw new Error('Unexpected number of containers');
    }

    for (const container of containers) {
      const links = Array.from($(container).find('a'));
      if (links.length !== 2) {
        throw new Error('Unexpected number of links');
      }

      const link = links[1];
      const text = $(link).text().trim().toUpperCase();
      if (text.startsWith(expectedText)) {
        downloadURL = $(link).attr('href');
        break;
      }
    }

    // Si no hay link, informo que los datos aún no están publicados
    if (downloadURL === null) {
      return null;
    }

    // Completo la url
    downloadURL = `https://www.car-importers.org.il${downloadURL}`;

    // Descargo el archivo
    const fileContent = await axios(downloadURL, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

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

    // La tabla siempre está en la primera página
    const pages = pdfJSON.Pages;
    if (pages.length !== 1) {
      throw new Error('Unexpected number of pages');
    }

    const texts = pages[0].Texts;

    // Me quedo con las celdas de la tabla
    let startIndex = -1;
    let endIndex = -1;
    let count = 0;
    for (const text of texts) {
      if (text.R[0].T === 'Total') {
        count++;
        if (count === 1) {
          startIndex = texts.indexOf(text);
        } else if (count === 2) {
          endIndex = texts.indexOf(text);
          break;
        }
      }
    }
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Table start pattern or end pattern not found');
    }
    const cells: Text[] = texts.slice(startIndex + 1, endIndex);

    // La cantidad de celdas debe ser un múltiplo de 6
    // porque la tabla tiene 6 columnas y no hay celdas en blanco
    if (cells.length % 6 !== 0) {
      throw new Error('Unexpected number of cells');
    }

    // Valido los datos con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z
          .string()
          .transform((val) => decodeURIComponent(val).trim().toUpperCase()),
        ytd_electric_registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
        ytd_hybrid_registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
        ytd_plugin_registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
        ytd_diesel_plugin_registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
        ytd_registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (let i = 0; i < cells.length; i += 6) {
      const parsed = Schema.parse({
        year,
        month,
        brand: cells[i + 0].R[0].T,
        ytd_electric_registrations: cells[i + 1].R[0].T,
        ytd_hybrid_registrations: cells[i + 2].R[0].T,
        ytd_plugin_registrations: cells[i + 3].R[0].T,
        ytd_diesel_plugin_registrations: cells[i + 4].R[0].T,
        ytd_registrations: cells[i + 5].R[0].T,
      });

      registrations.push(parsed);
    }

    return [
      {
        name: 'ytd_registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
