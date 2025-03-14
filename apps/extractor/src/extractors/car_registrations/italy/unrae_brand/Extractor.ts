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

const SOURCE_URL = 'https://unrae.it/dati-statistici/immatricolazioni?page=1';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'italy'],
      source: 'unrae_brand',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;
    const html = await axios.get(SOURCE_URL);
    const $ = cheerio.load(html.data);

    // Extraigo los links de la primera página
    let mainLinks: { text: string; href: string }[] = [];
    $(`.cat_art_container a`).each((_, element) => {
      const text = $(element).text().trim();
      const href = $(element).attr('href') || '';
      mainLinks.push({ text, href });
    });

    // Busco el download link
    // Lo primero es q encuentro el link de la página principal
    // y cuando lo encuentre abro ese link para obtener
    // el link de descarga
    let downloadLink: string | null = null;
    const MONHT_MAP = {
      1: 'GENNAIO',
      2: 'FEBBRAIO',
      3: 'MARZO',
      4: 'APRILE',
      5: 'MAGGIO',
      6: 'GIUGNO',
      7: 'LUGLIO',
      8: 'AGOSTO',
      9: 'SETTEMBRE',
      10: 'OTTOBRE',
      11: 'NOVEMBRE',
      12: 'DICEMBRE',
    };
    // Importante acá se usan un guion largo –
    const mainLinkText = `IMMATRICOLAZIONI DI AUTOVETTURE PER MARCA – ${MONHT_MAP[month]} ${year}`;
    for (let i = 0; i < mainLinks.length; i++) {
      const mainLink = mainLinks[i];
      if (mainLink.text.trim().toUpperCase() === mainLinkText) {
        const response = await axios.get(mainLink.href);
        const $ = cheerio.load(response.data);

        // Busco los links dentro de div .unrae_art_box
        let hrefs: string[] = [];
        $(`.unrae_art_box a`).each((_, element) => {
          const href = $(element).attr('href') || '';
          hrefs.push(href);
        });

        // Me quedo con el segundo link encontrado
        // que es el que tiene el pdf
        downloadLink = hrefs[1];
        break;
      }
    }

    // Informo que no se encontró el link
    if (!downloadLink) {
      return null;
    }

    const fileContent = await axios(downloadLink, {
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

    // Me quedo con los textos de la primera página
    const texts = pdfJSON.Pages[0].Texts;

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

    // Ordenos los rows por x
    rows = rows.map((row) => {
      return row.sort((a, b) => a.x - b.x);
    });

    // Me quedo solo con los rows de 11 columnas
    rows = rows.filter((row) => row.length === 11);

    // Valido datos con zod
    const Schema = z
      .object({
        year: z.number().int(),
        month: z.number().int(),
        brand: z.preprocess((value: string) => {
          return decodeURIComponent(value).trim().toUpperCase();
        }, z.string()),
        registrations: z.preprocess((value: string) => {
          return parseInt(
            decodeURIComponent(value).trim().replace(/\./g, ''),
            10
          );
        }, z.number()),
        market_share: z.preprocess((value: string) => {
          return parseFloat(decodeURIComponent(value).trim().replace(',', '.'));
        }, z.number()),
      })
      .strict();

    const registrations = [];
    for (const row of rows) {
      const parsed = Schema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: row[0].R[0].T,
        registrations: row[1].R[0].T,
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
