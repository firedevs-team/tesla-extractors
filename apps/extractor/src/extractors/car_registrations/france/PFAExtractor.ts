import axios from 'axios';
import * as cheerio from 'cheerio';
import PDFParser, { Output, Text } from 'pdf2json';
import z from 'zod';
import {
  BaseExtractor,
  FileData,
  FileOuput,
  MonthDateId,
} from '../../../lib/BaseExtractor';

const SOURCE_URL = 'https://pfa-auto.fr/marche-automobile';

class PFAExtractor extends BaseExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'france'],
      source: 'pfa',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    const titles = [];
    const links = [];
    const h3Elements = $('.tab-pane.active h3');
    const aElements = $('.tab-pane.active a');

    h3Elements.each((_, h3) => {
      titles.push($(h3).text().trim().toUpperCase());
    });
    aElements.each((_, a) => {
      links.push($(a).attr('href'));
    });

    // Mapeo los links para poder comparar
    const months = [
      'JANVIER',
      'FÉVRIER',
      'MARS',
      'AVRIL',
      'MAI',
      'JUIN',
      'JUILLET',
      'AOÛT',
      'SEPTEMBRE',
      'OCTOBRE',
      'NOVEMBRE',
      'DÉCEMBRE',
    ];
    const mappedLinks = titles.map((title, index) => {
      const url = links[index];
      const parts = title.split(' ');
      const month = months.indexOf(parts[0]) + 1;
      const year = parseInt(parts[1]);

      return {
        url,
        year,
        month,
      };
    });

    // Encuentro el link que corresponde a la fecha
    const link = mappedLinks.find((link) => {
      return link.year === dateId.year && link.month === dateId.month;
    });
    // Informo que no se encontró el dato
    if (!link) {
      return null;
    }

    const fileContent = await axios(link.url, {
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
        name: 'top_100_registrations_by_model',
        data: registrations,
      },
    ];
  }
}

export default new PFAExtractor();
