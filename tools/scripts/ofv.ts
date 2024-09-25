import * as z from 'zod';
import puppeteer, { Browser, Page } from 'puppeteer';
import * as path from 'path';
import * as os from 'os';
import { writeFile } from 'fs/promises';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Parser } from 'json2csv';

const yearMap = {
  2021: 0,
  2022: 1,
  2023: 2,
  2024: 3,
};
const monthMap = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  10: 9,
  11: 10,
  12: 11,
};

const changeSlicer = async (
  page: Page,
  slicerIndex: number,
  itemIndex: number
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
    (slicerIndex: number, itemIndex: number) => {
      // Encuentra el dropdown content
      const dropdownContents = document.querySelectorAll(
        '.slicer-dropdown-content'
      );
      const dropdownContent = dropdownContents[slicerIndex];

      // Busco la lista de items
      const items = dropdownContent.querySelectorAll('.slicerText');
      const item = items[itemIndex];

      // Le doy click al item
      (item as HTMLElement).click();
    },
    slicerIndex,
    itemIndex
  );

  // Espero a que cargue el contenido del dashboard
  await new Promise((resolve) => setTimeout(resolve, 3000));
};

const getTableValues = async (page: Page) => {
  // Ejecuta en el contexto del navegador para extraer los textos de las celdas
  const cellTexts = await page.evaluate(() => {
    // Selecciona todas las celdas con el selector proporcionado
    const cells = document.querySelectorAll('.mid-viewport .cell-interactive');

    const values = Array.from(cells).map(
      (cell) => cell.textContent?.trim() || ''
    );

    return values;
  });

  // Divido los valores en 20 sub-arrays
  const cellValues = [];
  for (let i = 0; i < cellTexts.length; i += 12) {
    cellValues.push(cellTexts.slice(i, i + 12));
  }

  return cellValues;
};

const getTopRegistrationsByBrand = async (
  page: Page,
  year: number,
  month: number
) => {
  const table = await getTableValues(page);

  const Schema = z.object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12),
    brand: z.preprocess((value) => {
      // Decodifica, limpia y convierte a mayúsculas
      return (value as string).trim().toUpperCase();
    }, z.string()),
    registrations: z.preprocess((value) => {
      // DEBUG CODE
      const text = (value as string).trim().replace(/[.,]/g, '');
      if (text === '') {
        return undefined;
      }

      const number = parseInt(text, 10);

      console.log('value:', value);
      console.log('text:', text);
      console.log('number:', number);

      // Decodifica, limpia, elimina puntos y convierte a número entero
      return number;
    }, z.number().optional()),

    market_share: z.preprocess((value) => {
      // DEBUG CODE
      const text = (value as string).replace(',', '.').replace('%', '').trim();
      if (text === '') {
        return undefined;
      }

      const number = parseFloat(text);

      console.log('value:', value);
      console.log('text:', text);
      console.log('number:', number);

      // Decodifica y convierte a número flotante
      return number;
    }, z.number().optional()),
  });

  const registrations = [];
  for (const row of table) {
    const parsed = Schema.parse({
      year,
      month,
      brand: row[1],
      registrations: row[2],
      market_share: row[3],
    });

    registrations.push(parsed);
  }

  return registrations;
};

const saveData = async (registrations: any[], fileName: string) => {
  // Guardar la información
  const json2csvParser = new Parser({});
  const csv = json2csvParser.parse(registrations);
  const filePath = path.join(
    process.cwd(),
    'data',
    'extractor',
    'norway',
    'data',
    'ofv',
    fileName
  );
  const fileExists = fs.existsSync(filePath);

  let csvData = csv;
  // Si el archivo existe, omite la cabecera
  if (fileExists) {
    csvData = `\n${csv.split('\n').slice(1).join('\n')}`;
  }

  fs.appendFileSync(filePath, csvData);

  console.log(`> Data saved.`);
};

const run = async () => {
  // Inicia el navegador
  const browser: Browser = await puppeteer.launch({
    headless: false, // Cambia a true si no necesitas ver la interacción
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
  });

  // Abre una nueva pestaña
  const page: Page = await browser.newPage();

  // Configura el viewport (opcional)
  await page.setViewport({ width: 1280, height: 800 });

  // Navega a la página deseada
  await page.goto(
    'https://app.powerbi.com/view?r=eyJrIjoiNzZjMzI0MWQtYzVhOC00ZjkxLWI5ZjQtNDQ4OTEyOWRlZWU2IiwidCI6ImYwOGMzNTQyLWY5NWYtNDE3ZC04NmU5LTZhZWQ5NzY1ODRhMCIsImMiOjh9',
    { waitUntil: 'networkidle2' }
  );

  // Espero a que se muestren los selectores de los slicers
  await page.waitForSelector('.slicer-dropdown-menu', { timeout: 10000 });

  const year = 2024;
  const month = 7;
  const fileName = 'top_registrations_by_brand.csv';

  // Selecciono año 2023
  await changeSlicer(page, 0, yearMap[year]);

  // Selecciono mes de enero
  await changeSlicer(page, 1, monthMap[month]);

  const registrations = await getTopRegistrationsByBrand(page, year, month);

  await saveData(registrations, fileName);

  // // Debug en code
  // const tmpFile = path.join(os.tmpdir(), `${new Date().valueOf()}.json`);
  // await writeFile(tmpFile, JSON.stringify(registrations, null, 2));
  // execSync(`code ${tmpFile}`);

  // Cierra el navegador
  await browser.close();
};

run();
