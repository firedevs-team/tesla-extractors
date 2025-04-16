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
      source: 'mia_model',
      fileext: 'pdf',
      disabled: true,
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descargo la página
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    const containers = Array.from($('.DnnModule-845 .org-box'));
    // Deben haber mínimo 14 contenedores
    // por cada año que parten en el 2006
    if (containers.length < 14) {
      console.debug({
        containers_length: containers.length,
      });
      throw new Error('Unexpected number of containers');
    }

    // Encuento el link de descarga
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
          if (text === `EV SALES ${MONTH_MAP[month]} ${year}`) {
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

    if (dateId.lessOrEqualThan(new MonthDateId(2024, 10))) {
      return this.transformUntil2024_10(dateId, fileData);
    }

    if (dateId.equals(new MonthDateId(2024, 11))) {
      return this.transform2024_11(dateId, fileData);
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

    // Siempre es una página
    const pages = pdfJSON.Pages;
    if (pages.length !== 1) {
      throw new Error('Unexpected number of pages');
    }

    const texts = pages[0].Texts;

    // Hago un corte del contenido
    // para que quedarme con los datos de la tabla
    const startPos = texts.findIndex(
      (cell) => decodeURIComponent(cell.R[0].T) === 'Year'
    );
    if (startPos === -1) {
      throw new Error('Start position not found');
    }

    const endPos = texts.findIndex(
      (cell) => decodeURIComponent(cell.R[0].T) === 'Make and Model'
    );
    if (endPos === -1) {
      throw new Error('End position not found');
    }
    const cells = texts.slice(startPos + 1, endPos);

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        engine_type: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        segment: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        model: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;
    const registrations: Registrations[] = [];

    // Creo los registros, los validos y los guardo
    let engine_type = '';
    let segment = '';
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const text = decodeURIComponent(cell.R[0].T).replace(/\u00A0/g, ' ');

      // Si es un texto sin espacio es un engine_type
      if (/^[A-Z]+/.test(text)) {
        engine_type = text;
        continue;
      }

      // Si es un texto con exactamente 3 espacios antes es un segment
      if (text.match(/^ {3}\S.*$/) !== null) {
        segment = text;
        continue;
      }

      // Si es un texto con exactamente 6 espacios antes es un model
      if (text.match(/^ {6}\S.*$/) !== null) {
        const model = text;
        const _registrations = decodeURIComponent(cells[i + month].R[0].T);

        i += month;

        const parsed = Schema.parse({
          year,
          month,
          engine_type,
          segment,
          model,
          registrations: _registrations,
        });

        registrations.push(parsed);

        continue;
      }
    }

    return [
      {
        name: 'registrations_by_model',
        data: registrations,
      },
    ];
  }

  async transformUntil2024_10(
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

    // Siempre es una página
    const pages = pdfJSON.Pages;
    if (pages.length !== 1) {
      throw new Error('Unexpected number of pages');
    }

    const texts = pages[0].Texts;

    // Me quedo con las celdas de la tabla
    const startPos = texts.findIndex((cell) => cell.R[0].T.startsWith('YTD'));
    const cells = texts.slice(startPos + 3);

    // Creo rows por las coordenadas
    const TOLERANCE = 0.036;
    let rows: Text[][] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      // Busco a que row pertenece
      // Si no hay ninguno, se crea un nuevo row
      const match = rows.find((row) => {
        return Math.abs(row[0].y - cell.y) < TOLERANCE;
      });
      if (match) {
        match.push(cell);
      } else {
        rows.push([cell]);
      }
    }

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        engine_type: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        segment: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        model: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    let engine_type = '';
    let segment = '';
    const registrations: Registrations[] = [];
    for (const row of rows) {
      // Es un atributo
      if (row.length === 1) {
        // Si la primera letra es del abecedario es un engine_type
        if (/^[A-Z]/.test(row[0].R[0].T)) {
          engine_type = row[0].R[0].T;
        } else {
          segment = row[0].R[0].T;
        }
        continue;
      }

      const parsed = Schema.parse({
        year,
        month,
        engine_type,
        segment,
        model: row[0].R[0].T,
        registrations: row[month].R[0].T,
      });

      // Ignoro el brand Total_...
      if (parsed.model.startsWith('TOTAL')) {
        continue;
      }

      registrations.push(parsed);
    }

    return [
      {
        name: 'registrations_by_model',
        data: registrations,
      },
    ];
  }

  async transform2024_11(
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

    // Siempre es una página
    const pages = pdfJSON.Pages;
    if (pages.length !== 1) {
      throw new Error('Unexpected number of pages');
    }

    const texts = pages[0].Texts;

    // Hago un corte del contenido
    // para que quedarme con los datos de la tabla
    const startPos = texts.findIndex((cell) => cell.R[0].T === 'Year');
    if (startPos === -1) {
      throw new Error('Start position not found');
    }

    const endPos = texts.findIndex((cell) => cell.R[0].T.endsWith('Passenger'));
    if (endPos === -1) {
      throw new Error('End position not found');
    }
    const cells = texts.slice(startPos + 1, endPos);

    // La tabla tiene 13 columnas asi
    // que separo por cada 13 cells para fomar los rows
    const totalColumns = 13;
    let rows: Text[][] = [];
    let currentRow: Text[] = [];
    for (let i = 0; i < cells.length; i++) {
      currentRow.push(cells[i]);
      if (currentRow.length === totalColumns) {
        rows.push(currentRow);
        currentRow = [];
      }
    }

    // Creo grupos de rows que pertenecen a un clasificación
    // esto lo hago identificando si hay un row que la primera celda
    // el texto termina con "Total (Autobase)"
    let groups: Text[][][] = [];
    let currentGroup: Text[][] = [];
    for (const row of rows) {
      if (decodeURIComponent(row[0].R[0].T).endsWith('Total (Autobase)')) {
        currentGroup = [];
        groups.push(currentGroup);
      }
      currentGroup.push(row);
    }
    // Deben ser 13 grupos
    if (groups.length !== 13) {
      throw new Error('Unexpected number of groups');
    }

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        engine_type: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        segment: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        model: z.preprocess(
          (val: string) =>
            decodeURIComponent(val).toUpperCase().trim().replace(/\s+/g, '_'),
          z.string()
        ),
        registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).replace(/\s/g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;
    const registrations: Registrations[] = [];
    const clasifications = [
      ['ELECTRIC', 'PASSENGER'],
      ['ELECTRIC', 'SUV'],
      ['ELECTRIC', 'LIGHT COMMERCIAL'],
      ['ELECTRIC', 'HEAVY COMMERCIAL'],
      ['ELECTRIC', 'OTHERS'],
      ['ELECTRIC HYDROGEN FUEL CELL', 'PASSENGER'],
      ['PLUG-IN PETROL HYBRID', 'PASSENGER'],
      ['PLUG-IN PETROL HYBRID', 'SUV'],
      ['PLUG-IN PETROL HYBRID', 'LIGHT COMMERCIAL'],
      ['PETROL HYBRID', 'PASSENGER'],
      ['PETROL HYBRID', 'SUV'],
      ['PETROL HYBRID', 'LIGHT COMMERCIAL'],
      ['PETROL HYBRID', 'OTHERS'],
    ];
    for (let i = 0; i < clasifications.length; i++) {
      const clasification = clasifications[i];
      const group = groups[i];

      const engine_type = clasification[0];
      const segment = clasification[1];

      for (const row of group) {
        const parsed = Schema.parse({
          year,
          month,
          engine_type,
          segment,
          model: row[0].R[0].T,
          registrations: row[month].R[0].T,
        });

        registrations.push(parsed);
      }
    }

    return [
      {
        name: 'registrations_by_model',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
