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
      source: 'pfa',
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

    // Descargo el documento con datos detallados
    const downloadUrl = $(aElements[1]).attr('href');

    const fileContent = await axios(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
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

    // La tabla siempre está en la página 18
    // así reduzco el espacio de búsqueda
    const texts = pdfJSON.Pages[17].Texts;

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

    // Hay rows que tiene 20 columnas en vez de 16
    // esto ocurre pq el primero top 10 está en negritas
    // y duplica cada texto pq es otro formato
    // si tiene length 20 elimino los ultimos 4 elementos
    rows = rows.map((row) => {
      if (row.length === 20) {
        return row.slice(0, 16);
      }
      return row;
    });

    // Dejo solo los rows que tengan 16 columnas
    rows = rows.filter((row) => row.length === 16);

    // Ordenos los rows por x
    rows = rows.map((row) => {
      return row.sort((a, b) => a.x - b.x);
    });

    // Valido los YTD Registrations con zod
    const YTDRegistrationsSchema = z.object({
      year: z.number().int().min(1900).max(2100),
      month: z.number().int().min(1).max(12),
      model: z.string(),
      ytd_registrations: z.number(),
      ytd_market_share: z.number(),
    });

    const registrations = [];
    for (const row of rows) {
      for (let i = 0; i < row.length; i += 4) {
        const model = row[i + 1];
        const ytd_registrations = row[i + 2];
        const ytd_market_share = row[i + 3];

        const parsed = YTDRegistrationsSchema.parse({
          year: dateId.year,
          month: dateId.month,
          model: decodeURIComponent(model.R[0].T).toUpperCase(),
          ytd_registrations: parseInt(
            decodeURIComponent(ytd_registrations.R[0].T).replace(/\s/g, '')
          ),
          ytd_market_share: parseFloat(
            decodeURIComponent(ytd_market_share.R[0].T)
              .replace(',', '.')
              .replace('%', '')
          ),
        });
        registrations.push(parsed);
      }
    }

    // Ordeno los registrations por ytd_registrations
    registrations.sort((a, b) => b.ytd_registrations - a.ytd_registrations);

    return [
      {
        name: 'top_100_ytd_registrations_by_model',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
