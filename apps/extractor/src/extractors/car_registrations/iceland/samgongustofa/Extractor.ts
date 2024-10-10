import puppeteer, { Browser, Page } from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiZmJlMDY5N2QtYmQ5MC00ZjkwLWE4MGYtMTZkMDQ4YjBkNjk2IiwidCI6ImUxOGUxM2RjLWQ2MTUtNGUwNi1iNjBhLTkxYmNiMmY2YzRlMCIsImMiOjh9';

interface IData {
  by_brand: { brand: string; registrations: string }[];
  by_model: { model: string; registrations: string }[];
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'iceland'],
      source: 'samgongustofa',
      fileext: 'json',
      published_day: 5,
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const isPublished = await this.checkIfDataIsPublished(dateId);
    // Informo que los datos aún no están publicados
    if (!isPublished) {
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
    const data: IData = JSON.parse(fileData.data.toString());

    // Valido la data de brand
    const BrandSchema = z.object({
      year: z.number().int(),
      month: z.number().int(),
      brand: z.string().trim().toUpperCase(),
      registrations: z.coerce.number().int(),
    });

    const registrationsByBrand = [];
    for (const item of data.by_brand) {
      const parsed = BrandSchema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: item.brand,
        registrations: item.registrations,
      });

      registrationsByBrand.push(parsed);
    }

    // Valido la data de model
    const ModelSchema = z.object({
      year: z.number().int(),
      month: z.number().int(),
      model: z.string().trim().toUpperCase(),
      registrations: z.coerce.number().int(),
    });

    const registrationsByModel = [];
    for (const item of data.by_model) {
      const parsed = ModelSchema.parse({
        year: dateId.year,
        month: dateId.month,
        model: item.model,
        registrations: item.registrations,
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

  async debug() {}

  private async checkIfDataIsPublished(dateId: MonthDateId): Promise<boolean> {
    let result = false;

    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    try {
      // Abre una nueva pestaña
      const page: Page = await browser.newPage();

      // Configura el viewport (opcional)
      await page.setViewport({ width: 1280, height: 6000 });

      // Navega a la página deseada
      await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

      // Espero a que se muestren los selectores de los slicers
      await page.waitForSelector('.slicer-dropdown-menu', { timeout: 10000 });

      // Selecciono los selectores
      await this.selectSelectors(page, dateId);

      result = true;
    } catch (error) {
    } finally {
      // Cierro el navegador
      await browser.close();
    }

    return result;
  }

  private async selectSelectors(page: Page, dateId: MonthDateId) {
    // Abro el slicer de tipo de importación
    // y selecciono "Nýtt" que se traduce como nuevo
    await page.evaluate(async () => {
      // Encuentra el slicer
      const slicers = document.querySelectorAll('.slicer-dropdown-menu');
      const slicer = slicers[2];

      // Le doy click al slicer
      (slicer as HTMLElement).click();

      // Espero 3 segundos a que abra el dropdown
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Encuentra el dropdown content
      const dropdownContents = document.querySelectorAll(
        '.slicer-dropdown-content'
      );
      const dropdownContent = dropdownContents[2];

      // Busco la lista de items
      const items = dropdownContent.querySelectorAll('.slicerText');
      const item = Array.from(items).find(
        (item) => item.textContent.trim() === 'Nýtt'
      );

      // Le doy click al item
      (item as HTMLElement).click();
    });

    // Abro el slicer de año y
    // selecciono el año de dateId
    await page.evaluate(async (year: number) => {
      // Encuentra el slicer
      const slicers = document.querySelectorAll('.slicer-dropdown-menu');
      const slicer = slicers[0];

      // Le doy click al slicer
      (slicer as HTMLElement).click();

      // Espero 3 segundos a que abra el dropdown
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Encuentra el dropdown content
      const dropdownContents = document.querySelectorAll(
        '.slicer-dropdown-content'
      );
      const dropdownContent = dropdownContents[0];

      // Busco la lista de items
      const items = dropdownContent.querySelectorAll('.slicerItemContainer');
      const item = Array.from(items).find((item) => {
        return (
          item.querySelector('.slicerText').textContent.trim() === `${year}`
        );
      });

      // Evito dar click si el item ya está seleccionado
      const checkBox = item.querySelector('.slicerCheckbox');
      if (checkBox.classList.contains('selected')) {
        return;
      }

      // Le doy click al item
      (item as HTMLElement).click();
    }, dateId.year);

    // Abro el slicer de mes y
    // selecciono el mes de dateId
    await page.evaluate(async (month: number) => {
      // Encuentra el slicer
      const slicers = document.querySelectorAll('.slicer-dropdown-menu');
      const slicer = slicers[1];

      // Le doy click al slicer
      (slicer as HTMLElement).click();

      // Espero 3 segundos a que abra el dropdown
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Encuentra el dropdown content
      const dropdownContents = document.querySelectorAll(
        '.slicer-dropdown-content'
      );
      const dropdownContent = dropdownContents[1];

      // Busco la lista de items
      const MONTH_MAP = {
        1: '01-janúar',
        2: '02-febrúar',
        3: '03-mars',
        4: '04-apríl',
        5: '05-maí',
        6: '06-júní',
        7: '07-júlí',
        8: '08-ágúst',
        9: '09-september',
        10: '10-október',
        11: '11-nóvember',
        12: '12-desember',
      };
      const items = dropdownContent.querySelectorAll('.slicerText');
      const item = Array.from(items).find(
        (item) => item.textContent.trim() === MONTH_MAP[month]
      );

      // Le doy click al item
      (item as HTMLElement).click();
    }, dateId.month);
  }

  private async downloadByBrand(dateId: MonthDateId): Promise<object[]> {
    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 6000 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren los selectores de los slicers
    await page.waitForSelector('.slicer-dropdown-menu', { timeout: 10000 });

    // Selecciono los selectores
    await this.selectSelectors(page, dateId);

    // Espero 5 segundos a que cargue la página
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Agrando el grafico
    await page.evaluate(async () => {
      const titleContainer = document.querySelectorAll(
        'visual-container .visualTitleArea'
      )[1];
      (titleContainer as HTMLElement).click();

      // Espero 1 segundo a que se pinte la información
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // El boton es el segundo q aparece
      const button = document.querySelectorAll('.vcPopOutBtn')[1];
      (button as HTMLElement).click();
    });

    // Espero 1 segundo a que se pinte la información
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Decargo la información de registros por marca
    const result = await page.evaluate(async () => {
      const chart = document.querySelectorAll('.cartesianChart')[0];

      const brandSelector = '.y.axis .tick text title';
      const totalSelector = '.columnChartUnclippedGraphicsContext .bar';

      // Encuentra las marcas y totales dentro del gráfico
      const brandElements = chart.querySelectorAll(brandSelector);
      const registrationsElements = chart.querySelectorAll(totalSelector);

      // Recorre las marcas y los totales, y los guarda en result
      let result: object[] = [];
      brandElements.forEach((brandElement, index) => {
        let brand = brandElement.textContent;
        let registrations =
          registrationsElements[index].getAttribute('aria-label');
        result.push({ brand, registrations });
      });

      return result;
    });

    // Cierro el navegador
    await browser.close();

    return result;
  }

  private async downloadByModel(dateId: MonthDateId): Promise<object[]> {
    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 9000 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren los selectores de los slicers
    await page.waitForSelector('.slicer-dropdown-menu', { timeout: 10000 });

    // Selecciono los selectores
    await this.selectSelectors(page, dateId);

    // Espero 5 segundos a que cargue la página
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Agrando el grafico
    await page.evaluate(async () => {
      const titleContainer = document.querySelectorAll(
        'visual-container .visualTitleArea'
      )[2];
      (titleContainer as HTMLElement).click();

      // Espero 1 segundo a que se pinte la información
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // El boton es el segundo q aparece
      const button = document.querySelectorAll('.vcPopOutBtn')[1];
      (button as HTMLElement).click();
    });

    // Espero 1 segundo a que se pinte la información
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Decargo la información de registros por marca
    const result = await page.evaluate(async () => {
      const chart = document.querySelectorAll('.cartesianChart')[1];

      const modelSelector = '.y.axis .tick text title';
      const totalSelector = '.columnChartUnclippedGraphicsContext .bar';

      // Encuentra los modelos y totales dentro del gráfico
      const modelElements = chart.querySelectorAll(modelSelector);
      const registrationsElements = chart.querySelectorAll(totalSelector);

      // Recorre los models y los totales, y los guarda en result
      let result: object[] = [];
      modelElements.forEach((modelElement, index) => {
        let model = modelElement.textContent;
        let registrations =
          registrationsElements[index].getAttribute('aria-label');
        result.push({ model, registrations });
      });

      return result;
    });

    // Cierro el navegador
    await browser.close();

    return result;
  }
}

export default new Extractor();
