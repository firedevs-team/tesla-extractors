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

const SOURCE_URL = 'https://seaa.gr/en/classifications/';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'greece'],
      source: 'seaa',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    // Encuentro el panel correspondiente al mes
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
    let panel: any = null;
    const panels = Array.from($('.fusion-panel'));
    for (const p of panels) {
      const text = $(p)
        .find('.fusion-toggle-heading')
        .text()
        .trim()
        .toUpperCase();
      if (text === `${MONTH_MAP[month]} ${year}`) {
        panel = p;
        break;
      }
    }

    // Informo que los datos aún no están publicados
    if (panel === null) {
      return null;
    }

    // Encuentro el link de descarga
    let downloadUrl: string = null;
    const links = Array.from($(panel).find('.panel-body a'));
    for (const link of links) {
      const text = $(link).text().trim().toUpperCase();
      if (text === 'PC AND TAXI CARS REGISTRATIONS BY MONTH') {
        downloadUrl = $(link).attr('href');
        break;
      }
    }

    // Si el link no se encontró, es un error
    if (downloadUrl === null) {
      console.debug({
        year,
        month,
        SOURCE_URL,
      });
      throw new Error('Download link not found');
    }

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

    // Schema zod
    const Schema = z
      .object({
        year: z.number().int(),
        month: z.number().int(),
        brand: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).trim().toUpperCase().replace(/\s+/g, '_'),
          z.string()
        ),
        ytd_registrations: z.preprocess(
          (val: string) => parseInt(decodeURIComponent(val).trim(), 10),
          z.number().int()
        ),
      })
      .strict();
    type YTDRegistrations = z.infer<typeof Schema>;

    // Extraigo los registrations
    const registrations: YTDRegistrations[] = [];
    for (const page of pdfJSON.Pages) {
      const texts = page.Texts;

      // Elimino los textos que no son útiles
      // y me quedo con los cells de la tabla
      let count = 0;
      const startIndex = texts.findIndex((text) => {
        if (decodeURIComponent(text.R[0].T) === 'Make') {
          count++;
          if (count === 2) {
            return true;
          }
        }
        return false;
      });
      const endIndex = texts.findIndex((text) => {
        return ['ΣΥΝΔΕΣΜΟΣ', 'TOTAL/ ΣΥΝΟΛΟ'].includes(
          decodeURIComponent(text.R[0].T)
        );
      });
      let _texts = texts.slice(startIndex + 1, endIndex);

      // Me quedo con los cells que tienen la info YTD
      _texts = _texts.filter((cell) => {
        return cell.x >= 43;
      });

      // Armo la tabla usando las coordenadas
      // Para crear un row necesito dejar en un arreglo
      // los que tenga la y igual o muy cercana
      const TOLERANCE = 0.22;
      let rows: Text[][] = [];
      for (let i = 0; i < _texts.length; i++) {
        const text = _texts[i];

        // Busco a que row pertenece
        // Si no hay ninguno, se crea un nuevo row
        const match = rows.find((row) => {
          return Math.abs(row[0].y - text.y) < TOLERANCE;
        });
        if (match) {
          match.push(text);
        } else {
          rows.push([text]);
        }
      }

      // Me quedo solo con los rows de 3 columnas
      rows = rows.filter((row) => row.length === 3);

      // Valido los datos con zod
      for (const row of rows) {
        const parsed = Schema.parse({
          year,
          month,
          brand: row[2].R[0].T,
          ytd_registrations: row[0].R[0].T,
        });
        registrations.push(parsed);
      }
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
