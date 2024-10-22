import axios from 'axios';
import puppeteer, { Browser, Page } from 'puppeteer';
import xlsx, { CellObject } from 'xlsx';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.auto.swiss/#tab-2';

interface IRow {
  brand: string;
  model: string;
  ytd_registrations: number;
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'switzerland'],
      source: 'autoswiss',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: false, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Bloquear la carga de imágenes
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.resourceType() === 'image') {
        request.abort(); // Evitar que se carguen las imágenes
      } else {
        request.continue();
      }
    });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que el tab 2 esté activo
    await page.waitForFunction(() => {
      const element = document.getElementById('tab-2');
      return element && element.classList.contains('is-active');
    });

    // Obtengo el link de descarga de los datos de este año
    const link = await page.evaluate(() => {
      const element = document.querySelector('#tab-2 a');
      return element!.getAttribute('href');
    });

    // Cierro el navegador
    await browser.close();

    // Descargo el archivo en memoria
    const fileContent = await axios(link, {
      responseType: 'arraybuffer',
    });

    // Valido que el año que se pida sea
    // el año en curso, que es lo que se puede descargar
    const tmpDate = new Date();
    tmpDate.setMonth(tmpDate.getMonth() - 1);
    const publishedYear = tmpDate.getFullYear();
    if (publishedYear !== year) {
      throw new Error('Year cannot be downloaded');
    }

    // Valido que los datos estén publicados
    const rows = await this.getTableData(dateId, {
      path: '',
      data: fileContent.data,
    });
    // Informo que no hay datos publicados
    if (rows.length === 0) {
      return null;
    }

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const rows = await this.getTableData(dateId, fileData);

    // Valido la data con zod
    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        model: z.string().trim().toUpperCase(),
        ytd_registrations: z.number().int(),
      })
      .strict();

    type IRegistrations = z.infer<typeof Schema>;
    const registrations: IRegistrations[] = [];
    for (const row of rows) {
      const parsed = Schema.parse({
        year,
        month,
        ...row,
      });
      registrations.push(parsed);
    }

    return [
      {
        name: 'ytd_registrations_by_model',
        data: registrations,
      },
    ];
  }

  async debug() {}

  private async getTableData(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<IRow[]> {
    const { month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la página que coincide con el mes
    const MONTH_MAP = {
      1: 'Jan',
      2: 'Febr',
      3: 'Mrz',
      4: 'Apr',
      5: 'Mai',
      6: 'Juni',
      7: 'Juli',
      8: 'Aug',
      9: 'Sept',
      10: 'Okt',
      11: 'Nov',
      12: 'Dez',
    };
    const sheetName = MONTH_MAP[month];

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Me con el contenido de la tabla
    const startPos = cells.findIndex((cell) => cell.data.w === 'Anzahl');
    const endPos = cells.findIndex((cell) => cell.data.w === 'Total');
    cells = cells.slice(startPos + 4, endPos);

    // Extraigo la información de la tabla
    const raw: IRow[] = [];
    for (let i = 0; i < cells.length; i += 6) {
      const brand = cells[i].data.w;
      const model = cells[i + 1].data.w;
      const ytd_registrations = cells[i + 2].data.v as number;

      raw.push({ brand, model, ytd_registrations });
    }

    // Elimino el último elemento que es el total
    raw.pop();

    return raw;
  }
}

export default new Extractor();
