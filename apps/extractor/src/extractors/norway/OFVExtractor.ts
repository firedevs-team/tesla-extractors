import puppeteer, { Browser, Page } from 'puppeteer';
import z from 'zod';
import {
  BaseExtractor,
  FileData,
  FileOuput,
  MonthDateId,
} from '../../lib/BaseExtractor';

const SOURCE_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiNzZjMzI0MWQtYzVhOC00ZjkxLWI5ZjQtNDQ4OTEyOWRlZWU2IiwidCI6ImYwOGMzNTQyLWY5NWYtNDE3ZC04NmU5LTZhZWQ5NzY1ODRhMCIsImMiOjh9';

const MONTH_MAP = {
  1: 'Januar',
  2: 'Februar',
  3: 'Mars',
  4: 'April',
  5: 'Mai',
  6: 'Juni',
  7: 'Juli',
  8: 'August',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Desember',
};

interface IData {
  by_brand: string[][];
  by_model: string[][];
}

class OFVExtractor extends BaseExtractor {
  constructor() {
    super({
      folder: 'norway',
      source: 'ofv',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const [by_brand, by_model] = await Promise.all([
      this.downloadTopRegistrationsByBrand(dateId),
      this.downloadTopRegistrationsByModel(dateId),
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

    const outputs = await Promise.all([
      this.transformTopRegistrationsByBrand(dateId, data.by_brand),
      this.transformTopRegistrationsByModel(dateId, data.by_model),
    ]);

    return outputs;
  }

  private downloadTopRegistrationsByBrand = async (
    dateId: MonthDateId
  ): Promise<string[][]> => {
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

    // Espero a que se muestren los selectores de los slicers
    await page.waitForSelector('.slicer-dropdown-menu', { timeout: 10000 });

    // Selecciono año
    await this.changeSlicer(page, 0, `${dateId.year}`);

    // Selecciono mes
    await this.changeSlicer(page, 1, MONTH_MAP[dateId.month]);

    // Extraigo los valores de la tabla
    const tableValues = await this.getTableValues(page);

    // Cierro el navegador
    await browser.close();

    return tableValues;
  };

  private downloadTopRegistrationsByModel = async (
    dateId: MonthDateId
  ): Promise<string[][]> => {
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

    // Espero a que se muestren los selectores de los slicers
    await page.waitForSelector('.slicer-dropdown-menu', { timeout: 10000 });

    // Doy click en ordenar por modelos
    // Obtiene las coordenadas del segundo <path> en el selector
    const { x, y } = await page.evaluate(() => {
      // Selecciona todos los elementos con el selector .ui-role-button-fill
      const paths = document.querySelectorAll('.ui-role-button-fill');

      const pathElement = paths[1]; // Selecciona el segundo elemento (posición 1)

      // Obtiene el rectángulo del elemento para obtener sus coordenadas
      const rect = pathElement.getBoundingClientRect();

      // Calcula las coordenadas X, Y en el centro del elemento
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });

    // Doy click en el botón
    await page.mouse.click(x, y);

    // Espero a que cargue el contenido del dashboard
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Selecciono año
    await this.changeSlicer(page, 0, `${dateId.year}`);

    // Selecciono mes
    await this.changeSlicer(page, 1, MONTH_MAP[dateId.month]);

    // Extraigo los valores de la tabla
    const tableValues = await this.getTableValues(page);

    // Cierro el navegador
    await browser.close();

    return tableValues;
  };

  private transformTopRegistrationsByBrand = async (
    dateId: MonthDateId,
    tableValues: string[][]
  ): Promise<FileOuput> => {
    const Schema = z.object({
      year: z.number().int().min(1900).max(2100),
      month: z.number().int().min(1).max(12),
      brand: z.preprocess((value) => {
        // Decodifica, limpia y convierte a mayúsculas
        return (value as string).trim().toUpperCase();
      }, z.string()),
      registrations: z.preprocess((value) => {
        const text = (value as string).trim().replace(/[.,]/g, '');
        if (text === '') {
          return undefined;
        }

        // Decodifica, limpia, elimina puntos y convierte a número entero
        return parseInt(text, 10);
      }, z.number().optional()),

      market_share: z.preprocess((value) => {
        const text = (value as string)
          .replace(',', '.')
          .replace('%', '')
          .trim();
        if (text === '') {
          return undefined;
        }

        // Decodifica y convierte a número flotante
        return parseFloat(text);
      }, z.number().optional()),
    });

    const registrations = [];
    for (const row of tableValues) {
      const parsed = Schema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: row[1],
        registrations: row[2],
        market_share: row[3],
      });

      registrations.push(parsed);
    }

    return {
      name: 'top_20_registrations_by_brand',
      data: registrations,
    };
  };

  private transformTopRegistrationsByModel = async (
    dateId: MonthDateId,
    tableValues: string[][]
  ): Promise<FileOuput> => {
    const Schema = z.object({
      year: z.number().int().min(1900).max(2100),
      month: z.number().int().min(1).max(12),
      model: z.preprocess((value) => {
        // Decodifica, limpia y convierte a mayúsculas
        return (value as string).trim().toUpperCase();
      }, z.string()),
      registrations: z.preprocess((value) => {
        const text = (value as string).trim().replace(/[.,]/g, '');
        if (text === '') {
          return undefined;
        }

        // Decodifica, limpia, elimina puntos y convierte a número entero
        return parseInt(text, 10);
      }, z.number().optional()),

      market_share: z.preprocess((value) => {
        const text = (value as string)
          .replace(',', '.')
          .replace('%', '')
          .trim();
        if (text === '') {
          return undefined;
        }

        // Decodifica y convierte a número flotante
        return parseFloat(text);
      }, z.number().optional()),
    });

    const registrations = [];
    for (const row of tableValues) {
      const parsed = Schema.parse({
        year: dateId.year,
        month: dateId.month,
        model: row[1],
        registrations: row[2],
        market_share: row[3],
      });

      registrations.push(parsed);
    }

    return {
      name: 'top_20_registrations_by_model',
      data: registrations,
    };
  };

  private changeSlicer = async (
    page: Page,
    slicerIndex: number,
    itemText: string
  ) => {
    // Le doy click al dropdown
    await page.evaluate((slicerIndex: number) => {
      // Encuentra el dropdown
      const dropdowns = document.querySelectorAll('.slicer-dropdown-menu');
      const dropdown = dropdowns[slicerIndex];

      // Le doy click al dropdown
      (dropdown as HTMLElement).click();
    }, slicerIndex);

    // Espero a que cargue el contenido del dropdown selecionado
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Doy click al item deseado
    await page.evaluate(
      (slicerIndex: number, itemText: string) => {
        // Encuentra el dropdown content
        const dropdownContents = document.querySelectorAll(
          '.slicer-dropdown-content'
        );
        const dropdownContent = dropdownContents[slicerIndex];

        // Busco la lista de items
        const items = dropdownContent.querySelectorAll('.slicerText');
        const item = Array.from(items).find(
          (item) => item.textContent.trim() === itemText
        );

        // Le doy click al item
        (item as HTMLElement).click();
      },
      slicerIndex,
      itemText
    );

    // Espero a que cargue el contenido del dashboard
    await new Promise((resolve) => setTimeout(resolve, 4000));
  };

  private getTableValues = async (page: Page): Promise<string[][]> => {
    // Ejecuta en el contexto del navegador para extraer los textos de las celdas
    const cellTexts = await page.evaluate(() => {
      // Selecciona todas las celdas con el selector proporcionado
      const cells = document.querySelectorAll(
        '.mid-viewport .cell-interactive'
      );

      const values = Array.from(cells).map(
        (cell) => cell.textContent?.trim() || ''
      );

      return values;
    });

    // Divido los valores en 20 sub-arrays
    const cellValues: string[][] = [];
    for (let i = 0; i < cellTexts.length; i += 12) {
      cellValues.push(cellTexts.slice(i, i + 12));
    }

    return cellValues;
  };
}

export default new OFVExtractor();

// // Descargar archivo por date id
// setTimeout(async () => {
//   const dateId = { year: 2024, month: 8 };
//   const fileName = `${dateId.year}_${dateId.month}.json`;
//   const filePath = path.join(ofvExtractor.downloadsPath, fileName);

//   console.log(`- Downloading file: ${fileName}`);
//   const buffer = await ofvExtractor.download(dateId);
//   if (buffer) {
//     await writeFile(filePath, buffer);
//     console.log(`- File saved: ${fileName}`);
//   }
// }, 2000);

// // Reindexar archivos
// setTimeout(async () => {
//   console.log('- Reindexing files...');
//   await ofvExtractor.reindex();
//   console.log('- Files reindexed');
// }, 2000);
