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

const SOURCE_URL = 'https://pfa-auto.fr/marche-automobile';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'france'],
      source: 'pfa_brand',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { month, year } = dateId;

    // Descargo la página princial
    let response = await axios.get(SOURCE_URL);
    let $ = cheerio.load(response.data);

    let aElements = Array.from($('.t-entry-title a'));
    // Siempre debería haber al menos un artículo
    // si no lo hay, es un error, seguro cambiaron la estructura del html
    if (aElements.length === 0) {
      console.debug({
        SOURCE_URL,
      });
      throw new Error('Articles not found');
    }

    const MONTH_MAP = {
      1: 'JANVIER',
      2: 'FEVRIER',
      3: 'MARS',
      4: 'AVRIL',
      5: 'MAI',
      6: 'JUIN',
      7: 'JUILLET',
      8: 'AOUT',
      9: 'SEPTEMBRE',
      10: 'OCTOBRE',
      11: 'NOVEMBRE',
      12: 'DECEMBRE',
    };
    let articleUrl: string = null;
    for (const aElement of aElements) {
      const text = $(aElement)
        .text()
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      if (text.endsWith(`${MONTH_MAP[month]} ${year}`)) {
        articleUrl = $(aElement).attr('href');
        break;
      }
    }

    // Informo que no hay datos publicados aún
    if (!articleUrl) {
      return null;
    }

    // Descargo la página del artículo
    response = await axios.get(articleUrl);
    $ = cheerio.load(response.data);

    aElements = Array.from($('.post-content a'));

    // Me quedo con los links que tengan el texto
    // "Télécharger le document"
    aElements = aElements.filter((aElement) => {
      return (
        $(aElement).text().trim().toUpperCase() === 'TÉLÉCHARGER LE DOCUMENT'
      );
    });

    // Deben haber dos links un documento con datos esenciales
    // y otro con datos más detallados
    if (aElements.length !== 2) {
      console.debug({
        articleUrl,
      });
      throw new Error('Expected links not found');
    }

    // Descargo el documento con datos esenciales
    const downloadUrl = $(aElements[0]).attr('href');

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

    // Me quedo con los textos de la página 2
    // La tabla siempre está en la página 2
    const texts = pdfJSON.Pages[1].Texts;

    // Armo la tabla usando las coordenadas
    // Para crear un row necesito dejar en un arreglo
    // los que tenga la y igual o muy cercana
    const TOLERANCE = 0.02;
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

    // Encuentro la ubicación del primer row de la tabla
    // el que dice "TOTAL MARCHE", a partir de ahí
    // se encuentran los datos de la tabla
    const totalMarcheIndex = rows.findIndex((row) => {
      return decodeURIComponent(row[0].R[0].T) === 'TOTAL MARCHE';
    });

    // Me quedo con los rows que están
    // después de "TOTAL MARCHE"
    rows = rows.slice(totalMarcheIndex + 1);

    // Encuentro la ubicación del último row de la tabla
    // el que dice "AUSTRES", a partir de ahí elimino lo que sigue
    const austresIndex = rows.findIndex((row) => {
      return decodeURIComponent(row[0].R[0].T) === 'AUSTRES';
    });
    rows = rows.slice(0, austresIndex);

    // Valido con zod
    const Schema = z
      .object({
        year: z.number().int(),
        month: z.number().int(),
        brand: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).trim().toUpperCase().replace(/\s+/g, '_'),
          z.string()
        ),
        registrations: z.preprocess(
          (val: string) =>
            parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10),
          z.number().int()
        ),
        market_share: z.preprocess(
          (val: string) =>
            parseFloat(
              decodeURIComponent(val).replace(/\s/g, '').replace(',', '.')
            ),
          z.number()
        ),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const row of rows) {
      const parsed = Schema.parse({
        year,
        month,
        brand: row[0].R[0].T,
        registrations: row[3].R[0].T,
        market_share: row[4].R[0].T,
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
