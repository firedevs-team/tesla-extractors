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
  'https://anfac.com/category/actualidad/notas-de-matriculacion/';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'spain'],
      source: 'anfac',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Cargo el html de la página que lista los artículos
    let response = await axios.get(SOURCE_URL);
    let $ = cheerio.load(response.data);

    const MONTH_MAP = {
      1: 'ENERO',
      2: 'FEBRERO',
      3: 'MARZO',
      4: 'ABRIL',
      5: 'MAYO',
      6: 'JUNIO',
      7: 'JULIO',
      8: 'AGOSTO',
      9: 'SEPTIEMBRE',
      10: 'OCTUBRE',
      11: 'NOVIEMBRE',
      12: 'DICIEMBRE',
    };

    // La fecha de publicación siempre es
    // el mes siguiente que el dateId
    const publishedDate = new Date(year, month - 1);
    publishedDate.setMonth(publishedDate.getMonth() + 1);
    const publishedMonth = publishedDate.getMonth() + 1;
    const publishedYear = publishedDate.getFullYear();
    const expectedText = `DE ${MONTH_MAP[publishedMonth]} DE ${publishedYear}`;

    // Encuentro la url del primer artículo
    // publicado en la fecha esperada
    let detailPageUrl: string = null;
    Array.from($('.no-botones .card-info')).forEach((element) => {
      const cardInfo = $(element);
      const dateText = cardInfo.find('.card-date').text().trim();

      if (dateText.toUpperCase().endsWith(expectedText)) {
        // Me quedo con la última url encontrada
        // que sería la primera que se publica en el mes
        detailPageUrl = cardInfo.find('.card-description a').attr('href');
      }
    });

    // Si no se ha encontrado la url del artículo
    // informo que no hay datos publicados aún
    if (detailPageUrl === null) {
      return null;
    }

    // Cargo el html de la página del artículo
    response = await axios.get(detailPageUrl);
    $ = cheerio.load(response.data);

    const downloadUrl = $('section .btn a').attr('href');

    // Valido que el nombre de la url sea el esperado
    let url = downloadUrl.toLowerCase();
    let endExpected = `np-matriculaciones-${MONTH_MAP[
      month
    ].toLowerCase()}-${year}-completa.pdf`;
    if (url.endsWith(endExpected) === false) {
      throw new Error(
        `Invalid download url: "${url}". Must be end with: "${endExpected}"`
      );
    }

    // Descargo el archivo
    response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
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

    const outputs = await Promise.all([
      this.getRegistrationsByBrand(dateId, pdfJSON),
      this.getRegistrationsByModel(dateId, pdfJSON),
    ]);

    return outputs;
  }

  async getRegistrationsByBrand(
    dateId: MonthDateId,
    pdfJSON: Output
  ): Promise<FileOuput> {
    const { year, month } = dateId;

    // Me quedo con lás páginas que tienen
    // donde aparece la tabla de marcas
    const tableTile = 'MATRICULACIÓN DE TURISMOS POR MARCA.';
    const pages = pdfJSON.Pages.filter((page) => {
      return page.Texts.some((text) => {
        const textStr = decodeURIComponent(text.R[0].T);
        return textStr.includes(tableTile);
      });
    });

    // Schema zod para validar los datos
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z
          .string()
          .transform((val) => val.trim().toUpperCase().replace(/\s+/g, '_')),
        registrations: z.preprocess((val: string) => {
          return parseInt(val.replace(/\./g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    // Por cada página con la tabla de marcas
    // extraigo los datos de la tabla
    const registrations: Registrations[] = [];
    for (const page of pages) {
      // Armo la tabla usando las coordenadas
      // Para crear un row necesito dejar en un arreglo
      // los que tenga la y igual o muy cercana
      const TOLERANCE = 0.036;
      let rows: Text[][] = [];
      for (let i = 0; i < page.Texts.length; i++) {
        const text = page.Texts[i];

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

      // Me quedo con los rows que tengan 7 columnas
      // que es la cantidad de columnas que tiene la tabla
      rows = rows.filter((row) => row.length === 7);

      // Guardo los raw registrations
      const rawRegistrations: { brand: string; registrations: string }[] = [];
      for (const row of rows) {
        const brand = decodeURIComponent(row[0].R[0].T);
        const registrations = decodeURIComponent(row[1].R[0].T);
        rawRegistrations.push({ brand, registrations });
      }

      // Valido con zod
      for (const rawRegistration of rawRegistrations) {
        const parsed = Schema.parse({
          year,
          month,
          brand: rawRegistration.brand,
          registrations: rawRegistration.registrations,
        });

        // Ignoro el registration TOTAL
        if (parsed.brand === 'TOTAL') {
          continue;
        }

        // Evito agregar dos veces el mismo registrations
        // Esto lo hago porque en diciembre 2023 las tablas se repitieron
        // Esta lógica no afecta a otros años
        const exists = registrations.find((r) => {
          return (
            r.year === parsed.year &&
            r.month === parsed.month &&
            r.brand === parsed.brand &&
            r.registrations === parsed.registrations
          );
        });
        if (exists) {
          continue;
        }

        registrations.push(parsed);
      }
    }

    return {
      name: 'registrations_by_brand',
      data: registrations,
    };
  }

  async getRegistrationsByModel(
    dateId: MonthDateId,
    pdfJSON: Output
  ): Promise<FileOuput> {
    const { year, month } = dateId;

    // Me quedo con lás páginas que tiene
    // la tabla de matriculaciones por modelo
    const tableTile = 'MATRICULACIÓN DE TURISMOS POR MARCA Y MODELO.';
    const pages = pdfJSON.Pages.filter((page) => {
      return page.Texts.some((text) => {
        const textStr = decodeURIComponent(text.R[0].T);
        return textStr.includes(tableTile);
      });
    });

    // Schema zod para validar los datos
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z
          .string()
          .transform((val) => val.trim().toUpperCase().replace(/\s+/g, '_')),
        model: z
          .string()
          .transform((val) => val.trim().toUpperCase().replace(/\s+/g, '_')),
        registrations: z.preprocess((val: string) => {
          return parseInt(val.replace(/\./g, ''), 10);
        }, z.number().int()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    // Por cada página con la tabla de modelos
    // extraigo los datos de la tabla
    const registrations: Registrations[] = [];
    for (const page of pages) {
      // Armo la tabla usando las coordenadas
      // Para crear un row necesito dejar en un arreglo
      // los que tenga la y igual o muy cercana
      const TOLERANCE = 0.036;
      let rows: Text[][] = [];
      for (let i = 0; i < page.Texts.length; i++) {
        const text = page.Texts[i];

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

      // Me quedo con los rows que tengan 6 columnas
      // que es la cantidad de columnas que tiene la tabla
      rows = rows.filter((row) => row.length === 6);

      // Guardo los raw registrations
      const rawRegistrations: {
        brand: string;
        model: string;
        registrations: string;
      }[] = [];
      for (const row of rows) {
        const brand = decodeURIComponent(row[0].R[0].T);
        const model = decodeURIComponent(row[1].R[0].T);
        const registrations = decodeURIComponent(row[2].R[0].T);
        rawRegistrations.push({ brand, model, registrations });
      }

      // Valido con zod
      for (const rawRegistration of rawRegistrations) {
        const parsed = Schema.parse({
          year,
          month,
          brand: rawRegistration.brand,
          model: rawRegistration.model,
          registrations: rawRegistration.registrations,
        });

        // Evito agregar dos veces el mismo registrations
        // Esto lo hago porque en diciembre 2023 las tablas se repitieron
        // Esta lógica no afecta a otros años
        const exists = registrations.find((r) => {
          return (
            r.year === parsed.year &&
            r.month === parsed.month &&
            r.brand === parsed.brand &&
            r.model === parsed.model &&
            r.registrations === parsed.registrations
          );
        });
        if (exists) {
          continue;
        }

        registrations.push(parsed);
      }
    }

    return {
      name: 'registrations_by_model',
      data: registrations,
    };
  }

  async debug() {}
}

export default new Extractor();
