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

const SOURCE_URL = 'https://www.febiac.be/fr/presse';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'belgium'],
      source: 'febiac',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Cargo el html de la página que lista los artículos
    let response = await axios.get(SOURCE_URL);
    let $ = cheerio.load(response.data);

    // Infiero el texto esperado
    const MONTH_MAP = {
      1: 'JANVIER',
      2: 'FÉVRIER',
      3: 'MARS',
      4: 'AVRIL',
      5: 'MAI',
      6: 'JUIN',
      7: 'JUILLET',
      8: 'AOÛT',
      9: 'SEPTEMBRE',
      10: 'OCTOBRE',
      11: 'NOVEMBRE',
      12: 'DÉCEMBRE',
    };
    const expectedText = `IMMATRICULATIONS DE VÉHICULES NEUFS // ${MONTH_MAP[month]} ${year}`;

    // Encuentro el link del artículo
    let articleUrl: string = null;
    const aElements = Array.from($('.view-display-id-block_news li a'));
    for (const aElement of aElements) {
      const text = $(aElement).text().trim().toUpperCase();
      if (text === expectedText) {
        articleUrl = $(aElement).attr('href');
        break;
      }
    }

    // Informo que el archivo no está publicado aún
    if (articleUrl === null) {
      return null;
    }

    // Completo la url
    const BASE_URL = 'https://www.febiac.be';
    articleUrl = `${BASE_URL}${articleUrl}`;

    // Cargo el html de la página del artículo
    response = await axios.get(articleUrl);
    $ = cheerio.load(response.data);

    // Encuentro el link de descarga
    let downloadUrl: string = null;
    Array.from($('.file--mime-application-pdf a')).forEach((element) => {
      const text = $(element).text().trim().toUpperCase();
      if (text === 'CARS BY MAKE') {
        downloadUrl = $(element).attr('href');
      }
    });

    // Debe estar presente, si no es un error
    if (!downloadUrl) {
      console.debug({
        articleUrl,
      });
      throw new Error('Download url not found');
    }

    // Completo la url
    downloadUrl = `${BASE_URL}${downloadUrl}`;

    // Descargo el archivo
    response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });

    return response.data;
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

    const texts: Text[] = pdfJSON.Pages.reduce((acc, page) => {
      return acc.concat(page.Texts);
    }, []);

    // Armo la tabla usando las coordenadas
    // Para crear un row necesito dejar en un arreglo
    // los que tenga la y igual o muy cercana
    const TOLERANCE = 0.036;
    let rows: Text[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

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

    // Solo me quedo con los rows donde
    // el primer elemento del row es un texto que es número entero
    rows = rows.filter((row) => {
      const firstText = row[0];
      return /^[0-9]+$/.test(firstText.R[0].T);
    });

    // Schema zod para validar los datos
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
        market_share: z.preprocess((val: string) => {
          return parseFloat(
            decodeURIComponent(val).replace(',', '.').replace('%', '').trim()
          );
        }, z.number().min(0).max(100)),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const row of rows) {
      // Ignoro los rows donde registrations es un -
      if (row[2].R[0].T === '-') {
        continue;
      }

      // Valido los datos
      const parsed = Schema.parse({
        year,
        month,
        brand: row[1].R[0].T,
        registrations: row[2].R[0].T,
        market_share: row[3].R[0].T,
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
