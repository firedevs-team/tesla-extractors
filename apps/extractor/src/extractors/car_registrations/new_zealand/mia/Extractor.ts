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

const SOURCE_URL = 'https://www.mia.org.nz/Sales-Data/Vehicle-Sales';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'new_zealand'],
      source: 'mia',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descargo la página
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    const containers = Array.from($('.DnnModule-842 .org-box'));
    // Deben haber mínimo 19 contenedores
    // por cada año que parten en el 2006
    if (containers.length < 19) {
      throw new Error('Unexpected number of containers');
    }

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
    let downloadLink: string = null;
    for (const container of containers) {
      const text = $(container).find('h3').text().trim().toUpperCase();
      if (text === `${year}`) {
        const links = $(container).find('a');
        for (const link of links) {
          const text = $(link).text().trim().toUpperCase();
          if (text === `LPV ${MONTH_MAP[month]} ${year}`) {
            downloadLink = $(link).attr('href');
            break;
          }
        }
        break;
      }
    }

    // Informo que los datos aún no están publicados
    if (downloadLink === null) {
      return null;
    }

    // Completo la url
    downloadLink = `https://www.mia.org.nz${downloadLink}`;

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

    const pages = pdfJSON.Pages;
    const texts = pages.reduce((acc, page) => acc.concat(page.Texts), []);

    // Me quedo con las celdas de la tabla
    const startPos = texts.findIndex((cell) => cell.R[0].T === 'MAKE');
    const endPos = texts.findIndex((cell) => cell.R[0].T === 'TOTALS');
    const cells = texts.slice(startPos, endPos);

    // Creo rows por las coordenadas
    const TOLERANCE = 0.036;
    let rows: Text[][] = [];
    for (let i = 0; i < cells.length; i++) {
      const text = cells[i];

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

    // Elimino el título si es que aparece como una fila
    const titleRow = rows.find(
      (row) => row.length === 1 && row[0].R[0].T.length > 50
    );
    if (titleRow) {
      rows.splice(rows.indexOf(titleRow), 1);
    }

    // El primer row es el header, lo extraigo
    const headerRow = rows.shift();
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
    const cellMonthIndex = headerRow.findIndex(
      (cell) => cell.R[0].T === MONTH_MAP[month]
    );
    // Del header month saco las coordenadas de la celda
    const [leftX, rightX] = [
      headerRow[cellMonthIndex].x,
      headerRow[cellMonthIndex + 1].x,
    ];

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z
          .string()
          .transform((val) =>
            decodeURIComponent(val).trim().toUpperCase().replace(/\s+/g, '_')
          ),
        registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const row of rows) {
      const brand = row[0].R[0].T;

      let regs = '0';
      const match = row.find((cell) => cell.x >= leftX && cell.x < rightX);
      if (match) {
        regs = match.R[0].T;
      }

      // Valido los datos
      const parsed = Schema.parse({
        year,
        month,
        brand,
        registrations: regs,
      });
      registrations.push(parsed);
    }

    return [
      {
        name: 'registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
