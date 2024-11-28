import puppeteer, { Browser, Page } from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://data.gov.my/dashboard/car-popularity';
const MONTH_MAP = {
  1: 'JAN',
  2: 'FEB',
  3: 'MAR',
  4: 'APR',
  5: 'MAY',
  6: 'JUN',
  7: 'JUL',
  8: 'AUG',
  9: 'SEP',
  10: 'OCT',
  11: 'NOV',
  12: 'DEC',
};

interface ICarData {
  maker: string;
  model: string;
  cars: number[];
  cars_cumul: number[];
}

interface IResponse {
  data_last_updated: string;
  data_next_update: string;
  timeseries: {
    x: number[];
    [key: string]: ICarData | number[]; // Incluye el tipo de 'x' en las claves dinámicas
  };
}

interface IData {
  brand: string;
  model_3_registrations: number;
  model_y_registrations: number;
  model_s_registrations: number;
  model_x_registrations: number;
  registrations: number;
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'malaysia'],
      source: 'datagov',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero que se muestre el botón de "Compare now!"
    await page.waitForFunction(() => {
      return Array.from(
        document.querySelectorAll('section:nth-child(2) button.select-none')
      ).some(
        (button) => button.textContent?.trim().toUpperCase() === 'COMPARE NOW!'
      );
    });

    // Deduzco la fecha de actualización esperada
    const expectedUpdateDate = new Date(year, month); // Un mes despues
    const expectedUpdateMonth = expectedUpdateDate.getMonth() + 1;
    const expectedUpdateYear = expectedUpdateDate.getFullYear();
    const expectedText = `${MONTH_MAP[expectedUpdateMonth]} ${expectedUpdateYear}`;

    // Indentifico si está la data esperada
    // ya está publicada en la página
    const texts = await page.$$('.space-y-6 .flex-col p.text-dim.text-sm');
    if (texts.length !== 2) {
      throw new Error('Date text not found');
    }
    const [lastUpdatedText] = texts;
    const text = await lastUpdatedText.evaluate((e) => e.textContent);
    if (!text.toUpperCase().includes(expectedText.toUpperCase())) {
      // Informo que no hay datos publicados aún
      return null;
    }

    // Limpio los modelos seleccionados por defecto
    let [clearButton, compareButton] = await page.$$(
      'section:nth-child(2) button.select-none'
    );
    await clearButton.click();

    // Intercepta las respuestas cuando ocurran
    const responses: IResponse[] = [];
    page.on('response', async (response) => {
      const EXPECTED_URL =
        'https://datagovmy.app/explorer/?explorer=car_popularity&maker_id';
      const url = response.url();
      // Debe ser la url esperada
      if (url.trim().startsWith(EXPECTED_URL)) {
        const method = response.request().method();
        // Ignora las peticiones OPTIONS preflight
        if (method === 'OPTIONS') {
          return;
        }
        const status = response.status();
        if (status >= 200 && status < 300) {
          const data = await response.json();
          responses.push(data);
        }
      }

      // if (response.url().includes(targetUrl)) {
      //   console.log(`Interceptando respuesta de: ${response.url()}`);
      //   try {
      //     // Obtiene los datos JSON de la respuesta
      //     responseData = await response.json();
      //     console.log('Datos capturados:', responseData);
      //   } catch (error) {
      //     console.error('Error al procesar la respuesta:', error);
      //   }
      // }
    });

    // Funcion para seleccionar un modelo
    const selectModel = async (model: string) => {
      const [input] = await page.$$('section:nth-child(2) input[type="text"]');
      await input.type(model);
      await page.waitForFunction(
        (model) => {
          const ulElement = document.querySelector(
            '[id="downshift-:r3:-menu"]'
          );
          if (!ulElement) {
            return false;
          }

          const liElement = Array.from(ulElement.querySelectorAll('li')).find(
            (li) => li.textContent?.trim().toUpperCase() === model.toUpperCase()
          );

          if (!liElement) {
            return false;
          }

          liElement.click();
          return true;
        },
        {},
        model
      );
    };

    // Selecciono tesla model 3 y Y y los comparo
    await selectModel('Tesla Model 3');
    await selectModel('Tesla Model Y');
    await compareButton.click();

    // Espero que hay 1 response capturado
    // luego continuo con el proceso
    // tiene un timeout de 30 segundos
    let timeout = 30000;
    let startTime = Date.now();
    while (responses.length === 0) {
      // Verifica si se ha alcanzado el timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          'Timeout alcanzado después de 30 segundos sin recibir respuestas.'
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Limpio los modelos seleccionados y recargo las referencias
    [clearButton, compareButton] = await page.$$(
      'section:nth-child(2) button.select-none'
    );
    await clearButton.click();

    // Selecciono tesla model S y X y los comparo
    await selectModel('Tesla Model S');
    await selectModel('Tesla Model X');
    await compareButton.click();

    // Espero que hay 1 response capturado
    // luego continuo con el proceso
    // tiene un timeout de 30 segundos
    timeout = 30000;
    startTime = Date.now();
    while (responses.length === 1) {
      // Verifica si se ha alcanzado el timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          'Timeout alcanzado después de 30 segundos sin recibir respuestas.'
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // De las respuestas obtengo la data
    const timestamps = responses[0].timeseries.x;
    const index = timestamps.findIndex((t) => {
      const date = new Date(t);
      return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
    });
    if (index === -1) {
      console.debug({
        year,
        month,
      });
      throw new Error('Data not found');
    }
    const data: IData = {
      brand: 'Tesla',
      model_3_registrations: (
        responses[0].timeseries['Tesla Model 3'] as ICarData
      ).cars[index],
      model_y_registrations: (
        responses[0].timeseries['Tesla Model Y'] as ICarData
      ).cars[index],
      model_s_registrations: (
        responses[1].timeseries['Tesla Model S'] as ICarData
      ).cars[index],
      model_x_registrations: (
        responses[1].timeseries['Tesla Model X'] as ICarData
      ).cars[index],
      registrations:
        (responses[0].timeseries['Tesla Model 3'] as ICarData).cars[index] +
        (responses[0].timeseries['Tesla Model Y'] as ICarData).cars[index] +
        (responses[1].timeseries['Tesla Model S'] as ICarData).cars[index] +
        (responses[1].timeseries['Tesla Model X'] as ICarData).cars[index],
    };

    // Cierro el navegador
    await browser.close();

    return Buffer.from(JSON.stringify(data, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    const raw: IData = JSON.parse(fileData.data.toString('utf-8'));

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess((val: string) => {
          return val
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        model_3_registrations: z.number().int(),
        model_y_registrations: z.number().int(),
        model_s_registrations: z.number().int(),
        model_x_registrations: z.number().int(),
        registrations: z.number().int(),
      })
      .strict();
    const parsed = Schema.parse({
      year,
      month,
      brand: raw.brand,
      model_3_registrations: raw.model_3_registrations,
      model_y_registrations: raw.model_y_registrations,
      model_s_registrations: raw.model_s_registrations,
      model_x_registrations: raw.model_x_registrations,
      registrations: raw.registrations,
    });

    return [
      {
        name: 'registrations_by_brand',
        data: [parsed],
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
