import AdmZip from 'adm-zip';
import axios from 'axios';
import Papa from 'papaparse';
import puppeteer, { Browser, Page } from 'puppeteer';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL =
  'https://datamall.lta.gov.sg/content/datamall/en/static-data.html#Vehicle%20Registration';
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

type IData = {
  month: string;
  make: string;
  importer_type: string;
  fuel_type: string;
  vehicle_type: string;
  number: number | null;
}[];

interface IGrouped {
  brand: string;
  /**
   * Total registrations
   */
  registrations: number;
  /**
   * Hatchback registrations
   */
  hb_registrations: number;
  /**
   * Sedan registrations
   */
  sdn_registrations: number;
  /**
   * Multi-Purpose Vehicle registrations
   */
  mpv_registrations: number;
  /**
   * Station-wagon registrations
   */
  stv_registrations: number;
  /**
   * Sports Utility Vehicle registrations
   */
  suv_registrations: number;
  /**
   * Coupe/ Converitible registrations
   */
  cpe_conv_registrations: number;
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'singapore'],
      source: 'lta',
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

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero a que se muestren el input de búsqueda
    await page.waitForSelector('#search_input', { timeout: 10000 });

    // Escribo la búsqueda
    await page.type(
      '#search_input',
      'Monthly New Registration of Cars by Make'
    );

    // Espero a que se muestren los resultados
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Extraigo la data del articulo
    const articles = await page.$$('.data_items .block-3-inner');
    if (articles.length !== 1) {
      throw new Error('Unexpected number of articles');
    }
    const article = articles[0];
    const links = await article.$$('a');
    if (links.length !== 3) {
      throw new Error('Unexpected number of links');
    }
    const link = links[2];
    const pathUrl = await link.evaluate((e) => e.getAttribute('href'));
    const publishText = await article.$eval('span', (e) => e.textContent);

    // Deduzco la fecha de actualizacion que siempre es un mes despues
    const publishDate = new Date(year, month);
    const publishMonth = publishDate.getMonth() + 1;
    const publishYear = publishDate.getFullYear();
    const expectedPublishText = `${MONTH_MAP[publishMonth]} ${publishYear}`;

    // Si no se encuetra el articulo con
    // la fecha esperada de publicación informo que no hay datos
    if (!publishText.toUpperCase().includes(expectedPublishText)) {
      return null;
    }

    // Completo la url
    const downloadUrl = `https://datamall.lta.gov.sg${pathUrl}`;

    // Cierro el browser
    await browser.close();

    // Descargo el archivo
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });

    // Obtengo el buffer del csv
    let csvData: Buffer = null;
    const zip = new AdmZip(response.data);
    zip.getEntries().forEach((entry) => {
      if (entry.entryName.endsWith('M03-Car_Regn_by_make.csv')) {
        csvData = entry.getData();
      }
    });
    if (csvData === null) {
      throw new Error('File not found in zip');
    }

    // Extraigo la data del mes del csv
    const result = Papa.parse<object>(csvData.toString('utf-8'), {
      header: true,
      dynamicTyping: true,
    });
    const data = result.data.filter((row) => {
      return row['month'] === `${year}-${month.toString().padStart(2, '0')}`;
    });

    // Devuelvo la data
    return Buffer.from(JSON.stringify(data, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    const raw: IData = JSON.parse(fileData.data.toString('utf-8'));

    // Me quedo solo con los electricos
    // más adelante puedo necesitar otra data
    // pero por ahora me voy a enfocar en electricos
    const electricData = raw.filter((row) => {
      return row.fuel_type.toUpperCase() === 'ELECTRIC';
    });

    // Agrupo la data para tener total por vehicle type y brand
    const groupedData: IGrouped[] = [];
    for (const item of electricData) {
      const brand = item.make;
      const vehicleType = item.vehicle_type;
      const number = item.number;

      let grouped = groupedData.find((g) => g.brand === brand);
      if (!grouped) {
        grouped = {
          brand,
          registrations: 0,
          hb_registrations: 0,
          sdn_registrations: 0,
          mpv_registrations: 0,
          stv_registrations: 0,
          suv_registrations: 0,
          cpe_conv_registrations: 0,
        };
        groupedData.push(grouped);
      }

      grouped.registrations += number;
      switch (vehicleType.toUpperCase()) {
        case 'HATCHBACK':
          grouped.hb_registrations += number;
          break;
        case 'SEDAN':
          grouped.sdn_registrations += number;
          break;
        case 'MULTI-PURPOSE VEHICLE':
          grouped.mpv_registrations += number;
          break;
        case 'STATION-WAGON':
          grouped.stv_registrations += number;
          break;
        case 'SPORTS UTILITY VEHICLE':
          grouped.suv_registrations += number;
          break;
        case 'COUPE/ CONVERTIBLE':
          grouped.cpe_conv_registrations += number;
          break;
        default:
          console.debug({
            brand,
            vehicleType,
          });
          throw new Error('Unknown vehicle type');
      }
    }

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
        registrations: z.number().int(),
        hb_registrations: z.number().int(),
        sdn_registrations: z.number().int(),
        mpv_registrations: z.number().int(),
        stv_registrations: z.number().int(),
        suv_registrations: z.number().int(),
        cpe_conv_registrations: z.number().int(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;
    const registrations: Registrations[] = [];
    for (const item of groupedData) {
      const parsed = Schema.parse({
        year,
        month,
        brand: item.brand,
        registrations: item.registrations,
        hb_registrations: item.hb_registrations,
        sdn_registrations: item.sdn_registrations,
        mpv_registrations: item.mpv_registrations,
        stv_registrations: item.stv_registrations,
        suv_registrations: item.suv_registrations,
        cpe_conv_registrations: item.cpe_conv_registrations,
      });

      registrations.push(parsed);
    }

    return [
      {
        name: 'registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
