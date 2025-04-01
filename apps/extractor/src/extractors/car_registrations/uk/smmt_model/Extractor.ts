import puppeteer from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.smmt.co.uk/vehicle-data/car-registrations/';

interface IRawRegistration {
  model: string;
  registrations: string;
}

interface IData {
  top_montly_models: IRawRegistration[];
  top_yearly_models: IRawRegistration[];
}

/**
 * Extractor de los top modelos vendidos en el Reino Unido
 *
 * Obtiene el top 10 de los modelos en el mes y
 * tambien una vista del top 10 de los modelos en el año
 */
class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'uk'],
      source: 'smmt_model',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Inicia el navegador
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page = await browser.newPage();

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se pinten los tabs que me interesan
    // así valido q la pagina q se cargó correctamente
    await page.waitForSelector('.buttons-container .tab-btn');

    // Ubico el tab de los modelos del mes
    const monthTabs = await page.$$('.buttons-container .tab-btn');
    const topModelsTab = monthTabs[3];

    // me aseguro que el layout de la pagina se mantenga
    if (monthTabs.length !== 5) {
      throw new Error('The number of tabs is not 5');
    }

    // Valido que el texto del tab sea el esperado
    // y que diga el mes esperado
    // si no es el mes esperado, asumo que no hay datos aún
    // o que ya se pusieron datos de otro mes
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
    const expectedPrefix = 'TOP MODELS ';
    const expectedText = expectedPrefix + MONTH_MAP[month] + ' ' + year;
    const monthTabText = await page.evaluate(
      (el) => (el as HTMLElement).innerText.toUpperCase(),
      topModelsTab
    );
    if (!monthTabText.startsWith(expectedPrefix)) {
      console.debug({
        monthTabText,
        expectedPrefix,
        expectedText,
      });
      throw new Error(
        `The tab text dont starts with the expected prefix: "${expectedPrefix}"`
      );
    }
    if (monthTabText !== expectedText) {
      // Si el texto no es el esperado informo que no hay datos
      return null;
    }

    // Los datos están en unos tab containers,
    // deben haber 5 al igual q los tabs
    const tabContainers = await page.$$('.tabs-container .tab-container');
    if (tabContainers.length !== 5) {
      throw new Error('The number of tab containers is not 5');
    }

    // Ambas tablas la misma estructura
    // por lo que puedo usar la misma función para extraer los datos
    const getDataFromTab = async (tabIndex: number) => {
      // Extraigo los datos de la tabla del container
      const rows = await tabContainers[tabIndex].$$('tbody tr');
      // Elimino la primera row que es el header
      rows.shift();
      const data: IRawRegistration[] = [];
      for (const row of rows) {
        const cells = await row.$$('td');
        const model = await cells[1].evaluate((el) => el.innerText);
        const registrations = await cells[2].evaluate((el) => el.innerText);

        data.push({
          model,
          registrations,
        });
      }
      return data;
    };

    // Obtengo los datos
    const topMonthlyModels: IRawRegistration[] = await getDataFromTab(3);
    const topYearlyModels: IRawRegistration[] = await getDataFromTab(4);

    const data: IData = {
      top_montly_models: topMonthlyModels,
      top_yearly_models: topYearlyModels,
    };

    // Cierro el navegador
    await browser.close();

    // Retorno el buffer con los datos
    return Buffer.from(JSON.stringify(data, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    // Parseo el json stringify que viene
    const data: IData = JSON.parse(fileData.data.toString('utf-8'));

    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.string().trim().toUpperCase(),
        registrations: z.preprocess(
          (val: string) => parseInt(val.replace(/,/g, ''), 10),
          z.number().int()
        ),
      })
      .strict();

    const topMonthlyModels = data.top_montly_models.map(
      ({ model, registrations }) => {
        // valido con zod
        const parsed = Schema.parse({
          year,
          month,
          model,
          registrations,
        });
        return parsed;
      }
    );

    const topYearlyModels = data.top_yearly_models.map(
      ({ model, registrations }) => {
        // valido con zod
        const parsed = Schema.parse({
          year,
          month,
          model,
          registrations,
        });
        return parsed;
      }
    );

    return [
      {
        name: 'top_10_registrations_by_model',
        data: topMonthlyModels,
      },
      {
        name: 'top_10_ytd_registrations_by_model',
        data: topYearlyModels,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
