import puppeteer, { Browser, Page } from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://mobility.dk/nyregistreringer/';
const MONTH_MAP = {
  1: 'JANUAR',
  2: 'FEBRUAR',
  3: 'MARTS',
  4: 'APRIL',
  5: 'MAJ',
  6: 'JUNI',
  7: 'JULI',
  8: 'AUGUST',
  9: 'SEPTEMBER',
  10: 'OKTOBER',
  11: 'NOVEMBER',
  12: 'DECEMBER',
};

interface IData {
  by_brand: string[][];
  by_model: string[][];
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'denmark'],
      source: 'mobility',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const isAvailable = await this.checkIfDataIsAvailable(dateId);
    // Informo que los datos aún no están publicados
    if (!isAvailable) {
      return null;
    }

    const [by_brand, by_model] = await Promise.all([
      this.downloadByBrand(dateId),
      this.downloadByModel(dateId),
    ]);

    const fileContent = JSON.stringify(
      {
        by_brand,
        by_model,
      },
      null,
      2
    );

    // Retorno buffer para cumplir con la interfaz
    return Buffer.from(fileContent, 'utf-8');
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const data: IData = JSON.parse(fileData.data.toString());

    // Valido by brand
    const BrandSchema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        registrations: z
          .string()
          .transform((val) => parseInt(val.replace(/\./g, ''), 10)),
        market_share: z
          .string()
          .transform((val) =>
            parseFloat(val.replace(',', '.').replace('%', ''))
          ),
      })
      .strict();

    const registrationsByBrand: object[] = [];
    for (const item of data.by_brand) {
      const parsed = BrandSchema.parse({
        year,
        month,
        brand: item[0],
        registrations: item[1],
        market_share: item[2],
      });
      registrationsByBrand.push(parsed);
    }

    // Valido by models
    const ModelSchema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.string().trim().toUpperCase(),
        registrations: z
          .string()
          .transform((val) => parseInt(val.replace(/\./g, ''), 10)),
        market_share: z
          .string()
          .transform((val) =>
            parseFloat(val.replace(',', '.').replace('%', ''))
          ),
      })
      .strict();

    const registrationsByModel: object[] = [];
    for (const item of data.by_model) {
      const parsed = ModelSchema.parse({
        year,
        month,
        model: item[0],
        registrations: item[1],
        market_share: item[2],
      });
      registrationsByModel.push(parsed);
    }

    return [
      {
        name: 'registrations_by_brand',
        data: registrationsByBrand,
      },
      {
        name: 'registrations_by_model',
        data: registrationsByModel,
      },
    ];
  }

  async test() {
    // await this.reindex();
  }

  private checkIfDataIsAvailable = async (
    dateId: MonthDateId
  ): Promise<boolean> => {
    const { year, month } = dateId;

    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 800 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren los selects
    await page.waitForSelector('.select-dropdown', { timeout: 10000 });

    // Cierro el dialogo de cookies
    await page.evaluate(() => {
      const button = document.querySelector('.CybotCookiebotBannerCloseButton');

      (button as HTMLElement).click();
    });

    // Espero 2 segundos a que cierra el dialogo
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Obtengo los textos de los periodos publicados
    const optionTexts = await page.evaluate(() => {
      const selectElement = document.querySelector('#selectPeriod');
      const options = Array.from(selectElement.querySelectorAll('option'));
      return options.map((option) => option.textContent.trim().toUpperCase());
    });

    // Verifico si está el texto del periodo deseado
    const monthName = MONTH_MAP[month];
    const lastDay = new Date(year, month, 0).getDate();

    const textExpected = `1. ${monthName} - ${lastDay}. ${monthName} ${year}`;
    const isAvailable = optionTexts.includes(textExpected);

    // Cierro el navegador
    await browser.close();

    return isAvailable;
  };

  private downloadByBrand = async (
    dateId: MonthDateId
  ): Promise<string[][]> => {
    const { year, month } = dateId;
    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 800 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren los selects
    await page.waitForSelector('.select-dropdown', { timeout: 10000 });

    // Cierro el dialogo de cookies
    await page.evaluate(() => {
      const button = document.querySelector('.CybotCookiebotBannerCloseButton');

      (button as HTMLElement).click();
    });

    // Espero 2 segundos a que cierra el dialogo
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Selecciona la opción deseada por su valor
    await page.select('#selectPeriod', 'last_month');

    // Espero a que el header de la tabla diga el periodo correcto
    const monthName = MONTH_MAP[month];
    const lastDay = new Date(year, month, 0).getDate();
    const textExpected = `1. ${monthName} TIL ${lastDay}. ${monthName} ${year}`;
    await page.waitForFunction(
      (text: string) => {
        const element = document.querySelectorAll(
          '.statistic-table thead tr .th-inner'
        )[1];

        return element && element.textContent.trim().toUpperCase() === text;
      },
      { timeout: 10000 },
      textExpected
    );

    // Extraigo los datos de la tabla
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('.statistic-table tbody tr');

      // Itera sobre cada fila y extrae el texto de los tres primeros <td>
      return Array.from(rows).map((row) => {
        const cells = row.querySelectorAll('td');

        // Obtiene el texto de los tres primeros <td>
        const cellTexts = Array.from(cells)
          .slice(0, 3)
          .map((cell) => cell.innerText.trim());
        return cellTexts;
      });
    });

    // Cierro el navegador
    await browser.close();

    return data;
  };

  private downloadByModel = async (
    dateId: MonthDateId
  ): Promise<string[][]> => {
    const { year, month } = dateId;
    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 800 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren los selects
    await page.waitForSelector('.select-dropdown', { timeout: 10000 });

    // Cierro el dialogo de cookies
    await page.evaluate(() => {
      const button = document.querySelector('.CybotCookiebotBannerCloseButton');

      (button as HTMLElement).click();
    });

    // Espero 2 segundos a que cierra el dialogo
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Selecciono el periodo del ultimo mes
    await page.select('#selectPeriod', 'last_month');
    // Seleciono vista por modelos
    await page.select('#selectView', 'models');

    // Espero a que el header de la tabla
    // diga el periodo correcto
    const monthName = MONTH_MAP[month];
    const lastDay = new Date(year, month, 0).getDate();
    const periodExpected = `1. ${monthName} TIL ${lastDay}. ${monthName} ${year}`;
    await page.waitForFunction(
      (text: string) => {
        const element = document.querySelectorAll(
          '.statistic-table thead tr .th-inner'
        )[1];
        return element && element.textContent.trim().toUpperCase() === text;
      },
      { timeout: 10000 },
      periodExpected
    );

    // Espero a que el header de la tabla
    // diga q es la vista por modelos
    const viewExpected = 'NYREGISTREREDE PERSONBILER PR. MODEL';
    await page.waitForFunction(
      (text: string) => {
        const element = document.querySelectorAll(
          '.statistic-table thead tr .th-inner'
        )[0];

        const textFound = element.textContent
          .replace(/\s+/g, ' ') // Reemplaza múltiples espacios o saltos de línea por un solo espacio
          .trim() // Elimina espacios en blanco al inicio y al final
          .toUpperCase();

        console.log(textFound, text);
        return textFound === text;
      },
      { timeout: 10000 },
      viewExpected
    );

    // Extraigo los datos de la tabla
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('.statistic-table tbody tr');

      // Itera sobre cada fila y extrae el texto de los tres primeros <td>
      return Array.from(rows).map((row) => {
        const cells = row.querySelectorAll('td');

        // Obtiene el texto de los tres primeros <td>
        const cellTexts = Array.from(cells)
          .slice(0, 3)
          .map((cell) => cell.innerText.trim());
        return cellTexts;
      });
    });

    // Cierro el navegador
    await browser.close();

    return data;
  };
}

export default new Extractor();
