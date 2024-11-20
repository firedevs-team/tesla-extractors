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

const SOURCE_URL =
  'https://www.osd.org.tr/osd-yayinlari/otomotiv-sektoru-aylik-degerlendirme-raporlari';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'turkey'],
      source: 'osd',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descarga la página donde están los links
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    const links = Array.from($('#belgeler-wrapper .post a'));
    let downloadUrl: string = null;
    for (const link of links) {
      const href = $(link).attr('href');
      const text = href.substring(href.lastIndexOf('\\') + 1);

      const zeroMonth = month < 10 ? `0${month}` : month;
      if (text.startsWith(`${zeroMonth}-${year}`)) {
        downloadUrl = href;
        break;
      }
    }

    // Informo que no se encontró el archivo
    if (downloadUrl === null) {
      return null;
    }

    // Completo la url con la base
    downloadUrl = `https://www.osd.org.tr${downloadUrl}`;

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

    interface IText {
      id: string;
      data: Text;
    }

    // Me quedo con la página 21 que es donde siempre está la tabla
    let texts: IText[] = pdfJSON.Pages[20].Texts.map((t, index) => ({
      id: `${index}`,
      data: t,
    }));

    // Me quedo con los textos que están entre 'TOTAL' y 'GENEL'
    // Que es el contenido dentro de la tabla
    let startIndex = -1;
    let count = 0;
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text.data.R[0].T.endsWith('otal')) {
        count++;
        if (count === 2) {
          startIndex = i;
          break;
        }
      }
    }
    texts = texts.slice(startIndex + 1);
    const endIndex = texts.findIndex((text) =>
      text.data.R[0].T.startsWith('GENEL')
    );
    texts = texts.slice(0, endIndex);

    // Creo rows usando coordenas y una tolerancia
    const Y_TOLERANCE = 0.02;
    let rows: IText[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      // Busco a que row pertenece
      // Si no hay ninguno, se crea un nuevo row
      const match = rows.find((row) => {
        return Math.abs(row[0].data.y - text.data.y) < Y_TOLERANCE;
      });
      if (match) {
        match.push(text);
      } else {
        rows.push([text]);
      }
    }

    // Unifico los textos que están muy cerca
    rows = rows.map((row) => {
      const X_TOLERANCE = 2;
      let newRow: IText[] = [];
      for (let i = 0; i < row.length; i++) {
        const text = row[i];

        // Busco a que texto pertenece
        // Si no hay ninguno, se crea un nuevo texto
        const match = newRow.find((r) => {
          return Math.abs(r.data.x - text.data.x) < X_TOLERANCE;
        });
        if (match) {
          match.data.R[0].T += '' + text.data.R[0].T;
          match.data.x = text.data.x;
        } else {
          newRow.push(text);
        }
      }
      return newRow;
    });

    // Me quedo solo con los rows de 15 columnas
    rows = rows.filter((row) => row.length === 15);

    // Schema zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess((val: string) => {
          return decodeURIComponent(val.replace(/%00/g, 'i'))
            .trim()
            .replace('C itroen', 'Citroen')
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        registrations: z.preprocess((val: string) => {
          let v = val.trim();
          if (v === '-') {
            return undefined;
          }
          return parseInt(v.replace('.', ''));
        }, z.number().int().optional()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const row of rows) {
      const parsed = Schema.parse({
        year,
        month,
        brand: row[0].data.R[0].T,
        registrations: row[month + 1].data.R[0].T,
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
