import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';
import path from 'path';
import { writeFile } from 'fs/promises';

const SOURCE_URL = `https://www.pzpm.org.pl/en/Electromobility/eRegistrations`;
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

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'poland'],
      source: 'pzpm',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descargo la página principal
    let response = await axios.get(SOURCE_URL);
    let $ = cheerio.load(response.data);

    // Extraigo los links de las páginas
    const pageLinks = $('.content-view-line a');

    // Encuentro la url del artículo
    let arcticleUrl: string = null;
    for (let i = 0; i < pageLinks.length; i++) {
      const text = $(pageLinks[i]).text().trim();
      if (text === `${MONTH_MAP[month]} ${year}`) {
        arcticleUrl = $(pageLinks[i]).attr('href');
        break;
      }
    }

    // Informo que los datos aún no están publicados
    if (!arcticleUrl) {
      return null;
    }

    // Descargo el artículo
    response = await axios.get(`https://www.pzpm.org.pl${arcticleUrl}`);
    $ = cheerio.load(response.data);

    let downloadUrl: string = null;
    const items = Array.from($('.content-view-line'));
    for (const item of items) {
      const aElements = $(item).find('a');
      const text = $(aElements[0]).text().trim();
      if (text === 'eRegistrations') {
        downloadUrl = `https://www.pzpm.org.pl${$(aElements[1]).attr('href')}`;
        break;
      }
    }

    // Debe haber un link de descarga si no es un error
    if (!downloadUrl) {
      console.debug({
        arcticleUrl,
      });
      throw new Error('Download link not found');
    }

    const fileContent = await axios(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la página de nombre "Osobowe - rankingi"
    const sheet = workbook.Sheets['Osobowe - rankingi'];

    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Me quedo con las celdas que tienen
    // el contenido de las tablas que me interesan
    let count = 0;
    const startPos = cells.findIndex((cell) => {
      if (cell.data.w?.startsWith('Udział')) {
        count++;
        if (count === 4) {
          return true;
        }
      }
      return false;
    });
    const endPos = cells.findIndex((cell) =>
      cell.data.w?.trim().startsWith('Razem')
    );
    cells = cells.slice(startPos + 1, endPos);

    // Extraigo los datos de la tabla
    // Siempre hay un texto que puede ser de marca o modelo
    // luego sigue el número de registros y el porcentaje
    let by_brand: object[] = [];
    let by_model: object[] = [];
    let isBrand = false;
    for (let i = 0; i < cells.length; i++) {
      let value = cells[i].data.w;
      if (!value) {
        continue;
      }

      value = value.replace(/\./g, '');
      value = value.replace(/,/g, '.');
      value = value.replace(/%/g, '');
      value = value.trim();
      const isNotNumber = isNaN(parseInt(value));
      if (isNotNumber) {
        // Alterno is brand flag
        isBrand = !isBrand;

        if (isBrand) {
          const brand = cells[i].data.v;
          const ytd_registrations = cells[i + 1].data.v;
          const ytd_market_share = cells[i + 2].data.v;
          by_brand.push({
            brand,
            ytd_registrations,
            ytd_market_share,
          });
        } else {
          const model = cells[i].data.v;
          const ytd_registrations = cells[i + 1].data.v;
          const ytd_market_share = cells[i + 2].data.v;
          by_model.push({
            model,
            ytd_registrations,
            ytd_market_share,
          });
        }
      }
    }

    // Valido la data de brand
    const BrandSchema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        ytd_registrations: z.number().int(),
        ytd_market_share: z.number().transform((val) => val * 100),
      })
      .strict();

    const by_brand_registrations: object[] = [];
    for (const item of by_brand) {
      const parsed = BrandSchema.parse({
        year,
        month,
        ...item,
      });
      by_brand_registrations.push(parsed);
    }

    // Valido la data de model
    const ModelSchema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.string().trim().toUpperCase(),
        ytd_registrations: z.number().int(),
        ytd_market_share: z.number().transform((val) => val * 100),
      })
      .strict();

    const by_model_registrations: object[] = [];
    for (const item of by_model) {
      const parsed = ModelSchema.parse({
        year,
        month,
        ...item,
      });
      by_model_registrations.push(parsed);
    }

    return [
      {
        name: 'top_10_ytd_bev_registrations_by_brand',
        data: by_brand_registrations,
      },
      {
        name: 'top_10_ytd_bev_registrations_by_model',
        data: by_model_registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
