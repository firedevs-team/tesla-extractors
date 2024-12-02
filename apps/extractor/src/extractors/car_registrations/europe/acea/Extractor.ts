import axios from 'axios';
import PDFParser, { Output, Text } from 'pdf2json';
import puppeteer, { Browser } from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.acea.auto/nav/?vehicle=passenger-cars';
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

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'global'],
      source: 'acea',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page = await browser.newPage();

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se pinten los artículos
    await page.waitForSelector('.post', { timeout: 10000 });

    // Obtengo los artículos
    const articles = await page.$$('.post');

    // Infiero la fecha de publicación esperada
    const expectedPublishedDate = new Date(year, month); // 1 mes después
    const expectedPublishedYear = expectedPublishedDate.getFullYear();
    const expectedPublishedMonth = expectedPublishedDate.getMonth() + 1;
    const expectedPublishedText = `${MONTH_MAP[expectedPublishedMonth]} ${expectedPublishedYear}`;

    // Encuentro la url del artículo
    let articleUrl: string = null;
    for (const article of articles) {
      const link = await article.$('.excerpt h2 a');
      const title = await link.evaluate((el) =>
        el.textContent.trim().toUpperCase()
      );

      // Identifico que es articulo de car registrations
      if (title.startsWith('NEW CAR REGISTRATIONS:')) {
        // Identifico que sea la fecha esperada
        const textContainer = await article.$('.terms');
        const publishedDateText = await textContainer.evaluate((el) =>
          el.textContent.trim().toUpperCase()
        );
        if (publishedDateText.endsWith(expectedPublishedText)) {
          articleUrl = await link.evaluate((el) => el.href);
          break;
        }
      }
    }

    // Informo si no se encontró el artículo
    if (!articleUrl) {
      return null;
    }

    // Navego a la url del artículo
    await page.goto(articleUrl, { waitUntil: 'networkidle2' });

    // Espero a que se pinte el boton de descarga del pdf
    await page.waitForSelector('.download-buttons a', { timeout: 10000 });

    // Encuento la url de descarg
    const links = await page.$$('.download-buttons a');
    if (links.length !== 1) {
      throw new Error('Unexpected number of links');
    }
    const donwloadUrl = await links[0].evaluate((el) => el.href);

    // Cierro el navegador
    await browser.close();

    // Descargo el archivo
    const fileContent = await axios.get(donwloadUrl, {
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

    // Me quedo siempre con la ultima página
    const tablePage = pdfJSON.Pages[pdfJSON.Pages.length - 1];

    // Armo la tabla usando las coordenadas
    // Para crear un row necesito dejar en un arreglo
    // los que tenga la y igual o muy cercana
    const TOLERANCE = 0.11;
    const rows: Text[][] = [];
    for (let i = 0; i < tablePage.Texts.length; i++) {
      const text = tablePage.Texts[i];

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

    // Filtro los rows validos
    // Un row es valido si el primer elemento empieza
    // con texto y los demas elementos son 10 numeros
    const validRows = rows.filter((row) => {
      const [brandRaw, ...values] = row;
      const brand = decodeURIComponent(brandRaw.R[0].T).trim().toUpperCase();
      if (/^[a-zA-Z]/.test(brand)) {
        const isValid = values.every((value) => {
          const digits = decodeURIComponent(value.R[0].T.trim())
            // todas las comas, puntos, guiones y signos de suma
            // deben ser eliminados para validar que sea un numero
            .replace(/,|-|\+|\./g, '');
          return !Number.isNaN(parseInt(digits));
        });
        if (isValid && values.length === 10) {
          return true;
        }
      }

      return false;
    });

    // Cambio el nombre de others por ${group} others
    // solo hay dos others uno para Volkswagen Group
    // y otro para Stellantis
    let assignedFirst = false;
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const brand = decodeURIComponent(row[0].R[0].T).trim().toUpperCase();
      if (brand === 'OTHERS') {
        if (!assignedFirst) {
          assignedFirst = true;
          row[0].R[0].T = 'Volkswagen Group Others';
        } else {
          row[0].R[0].T = 'Stellantis Others';
        }
      }
    }

    // Valido la data con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess((val: string) => {
          return decodeURIComponent(val)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        registrations: z.preprocess((val: string) => {
          return parseInt(decodeURIComponent(val).trim().replace(/,/g, ''));
        }, z.number().int()),
        market_share: z.preprocess((val: string) => {
          return parseFloat(decodeURIComponent(val).trim());
        }, z.number()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const row of validRows) {
      const parsed = Schema.parse({
        year,
        month,
        brand: row[0].R[0].T,
        registrations: row[3].R[0].T,
        market_share: row[1].R[0].T,
      });

      registrations.push(parsed);
    }

    return [
      {
        name: 'eu_efta_uk_registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
