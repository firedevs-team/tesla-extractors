import axios from 'axios';
import * as cheerio from 'cheerio';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import puppeteer, { Browser, Page } from 'puppeteer';

const SOURCE_URL = 'https://hkevdb.com/ev-sales-figures-{YEAR}-{MONTH}';

interface IData {
  by_brand: {
    brand: string;
    registrations: string;
  }[];
  by_model: {
    model: string;
    registrations: string;
  }[];
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'hong_kong'],
      source: 'hkevdb',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Primero verifico si hay datos disponibles
    let url = SOURCE_URL.replace('{YEAR}', year.toString()).replace(
      '{MONTH}',
      month.toString().padStart(2, '0')
    );
    try {
      await axios.get(url);
    } catch (error) {
      // Si me da un error 404 intento con el mes sin zero padding
      if (error.response.status === 404) {
        url = SOURCE_URL.replace('{YEAR}', year.toString()).replace(
          '{MONTH}',
          month.toString()
        );
        try {
          await axios.get(url);
        } catch (error) {
          // Si me da un 404 es porque no hay datos
          // Informo que los datos no están publicados aún
          if (error.response.status === 404) {
            return null;
          }
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Inicia el navegador
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page = await browser.newPage();

    // Navega a la página deseada
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Esperar a que ambos iframes estén disponibles
    await page.waitForFunction(() => {
      const elements = document.querySelectorAll('.flourish-chart iframe');
      return elements.length === 2;
    });

    // Obtener los iframes
    const iframes = await page.$$('.flourish-chart iframe');
    if (iframes.length !== 2) {
      throw new Error('Expected 2 iframes');
    }

    // Navego dentro de los iframes
    // y obengo la variable global _Flourish_data
    const registrations: IData = { by_brand: [], by_model: [] };
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      const src = await iframe.evaluate((node) => node.getAttribute('src'));

      // Navegar al iframe
      const iframePage = await browser.newPage();
      await iframePage.goto(src, { waitUntil: 'networkidle2' });

      // Espero a que esté disponible la variable global
      await iframePage.waitForFunction(() => {
        return window['_Flourish_data'] !== undefined;
      });

      // Obtengo la variable global
      let data: { label: string; value: string[] }[] =
        await iframePage.evaluate(() => window['_Flourish_data'].data);

      // Filtro datos que no tengan label
      // en el 2024_12 llegaron varios label sin texto ("")
      data = data.filter((d) => d.label !== '');

      if (i === 0) {
        registrations.by_brand = data.map((d) => ({
          brand: d.label,
          registrations: d.value[0],
        }));
      } else {
        registrations.by_model = data.map((d) => ({
          model: d.label,
          registrations: d.value[0],
        }));
      }
    }

    // Cierro el navegador
    browser.close();

    return Buffer.from(JSON.stringify(registrations, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    const rawData = JSON.parse(fileData.data.toString()) as IData;

    // Valido by_brand con zod
    const BrandSchema = z
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
        registrations: z.preprocess((val: string) => {
          return parseInt(val.trim());
        }, z.number().int()),
      })
      .strict();
    type BrandRegistrations = z.infer<typeof BrandSchema>;

    const by_brand: BrandRegistrations[] = [];
    for (const item of rawData.by_brand) {
      const parsed = BrandSchema.parse({
        year,
        month,
        brand: item.brand,
        registrations: item.registrations,
      });
      by_brand.push(parsed);
    }

    // Validar by_model con zod
    const ModelSchema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.preprocess((val: string) => {
          return val
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        registrations: z.preprocess((val: string) => {
          return parseInt(val.trim());
        }, z.number().int()),
      })
      .strict();
    type ModelRegistrations = z.infer<typeof ModelSchema>;

    const by_model: ModelRegistrations[] = [];
    for (const item of rawData.by_model) {
      const parsed = ModelSchema.parse({
        year,
        month,
        model: item.model,
        registrations: item.registrations,
      });
      by_model.push(parsed);
    }

    return [
      {
        name: 'registrations_by_brand',
        data: by_brand,
      },
      {
        name: 'registrations_by_model',
        data: by_model,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
