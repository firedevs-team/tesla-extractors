import puppeteer, { Browser, Page } from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://stats.beepbeep.ie/';

interface IData {
  by_brand: { brand: string; registrations: string; market_share: string }[];
  by_model: {
    brand: string;
    model: string;
    registrations: string;
    market_share: string;
  }[];
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'ireland'],
      source: 'beepbeep',
      fileext: 'json',
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
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 800 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren los título de los paneles
    await page.waitForSelector('.Panel__heading--plain', { timeout: 10000 });

    // Seleciono el año y el mes
    await page.select('#filter_date_year', `${year}`);
    await page.select('#filter_comparison_year', `${year}`);
    await page.select('#filter_date_month_from', `${month}`);
    await page.select('#filter_date_month_to', `${month}`);

    // Le doy click al botón de filtrar
    await page.click('.FilterControls a');

    // Espero a que se cargue la pagina
    // Esto lo hago si es que los filtros de arriba
    // pintan los filtros seleccionados previamente
    await page.waitForFunction(
      (year, month) => {
        const spans = document.querySelectorAll('span.FilterString__group');
        const texts = Array.from(spans).map((span) => span.textContent);
        if (texts[0] != `Year: ${year}`) {
          return false;
        }
        const MONTH_MAP = {
          1: 'January',
          2: 'February',
          3: 'March',
          4: 'April',
          5: 'May',
          6: 'June',
          7: 'July',
          8: 'August',
          9: 'September',
          10: 'October',
          11: 'November',
          12: 'December',
        };
        if (texts[1] != `Month From: ${MONTH_MAP[month]}`) {
          return false;
        }
        if (texts[2] != `Month To: ${MONTH_MAP[month]}`) {
          return false;
        }

        return true;
      },
      { timeout: 10000 },
      year,
      month
    );

    // Valido si hay datos publicados
    // Esto lo hago analizando la tabla  de
    // total de autos registrados, si el valor es 0
    // es que no hay datos publicados aún
    const isAvailable = await page.evaluate(async () => {
      const td = document.querySelector(
        '.Panel__body:nth-of-type(2) tbody tr td:nth-of-type(2)'
      );
      if (td.textContent.trim() === '0') {
        return false;
      }

      return true;
    });
    // Informo que no hay datos publicados
    if (!isAvailable) {
      return null;
    }

    // Extraigo los registros por marca
    const by_brand = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('#sales-by-make tbody tr')
      );

      const result: object[] = [];
      rows.forEach((row) => {
        const columns = Array.from(row.querySelectorAll('td'));
        const brand = columns[2].innerText;
        const registrations = columns[3].innerText;
        const market_share = columns[4].innerText;
        result.push({ brand, registrations, market_share });
      });

      return result;
    });

    // Extraigo los registros por modelos
    const by_model = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('#sales-by-model tbody tr')
      );

      const result: object[] = [];
      rows.forEach((row) => {
        const columns = Array.from(row.querySelectorAll('td'));
        const brand = columns[2].innerText;
        const model = columns[3].innerText;
        const registrations = columns[4].innerText;
        const market_share = columns[5].innerText;
        result.push({ brand, model, registrations, market_share });
      });

      return result;
    });

    // Cierro el navegador
    await browser.close();

    const buffer = Buffer.from(
      JSON.stringify({ by_brand, by_model }, null, 2),
      'utf-8'
    );

    return buffer;
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
      registrations: z.preprocess(
        (val: string) => parseInt(val.replace(/,/g, ''), 10),
        z.number().int()
      ),
      market_share: z.preprocess(
        (val: string) => parseFloat(val.replace('%', '')),
        z.number()
      ),
    });

    const registrationsByBrand = [];
    for (const item of data.by_brand) {
      const parsed = BrandSchema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: item.brand,
        registrations: item.registrations,
        market_share: item.market_share,
      });

      registrationsByBrand.push(parsed);
    }

    // Valido la data de model
    const ModelSchema = z.object({
      year: z.number().int(),
      month: z.number().int(),
      brand: z.string().trim().toUpperCase(),
      model: z.string().trim().toUpperCase(),
      registrations: z.preprocess(
        (val: string) => parseInt(val.replace(/,/g, ''), 10),
        z.number().int()
      ),
      market_share: z.preprocess(
        (val: string) => parseFloat(val.replace('%', '')),
        z.number()
      ),
    });

    const registrationsByModel = [];
    for (const item of data.by_model) {
      const parsed = ModelSchema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: item.brand,
        model: item.model,
        registrations: item.registrations,
        market_share: item.market_share,
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
}

export default new Extractor();
