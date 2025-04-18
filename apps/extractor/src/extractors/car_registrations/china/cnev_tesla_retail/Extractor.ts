import { Page } from 'puppeteer';
import z from 'zod';
import { FileData, FileOuput, MonthDateId } from '../../../../lib';
import CNEVExtractor from '../CNEVExtractor';

const SOURCE_URL = 'https://cnevdata.com/tesla/';

interface IData {
  total: string;
}

/**
 * Extractor para las ventas retail de Tesla en China
 */
class Extractor extends CNEVExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'china'],
      source: 'cnev_tesla_retail',
      fileext: 'json',
    });
  }

  async downloadFromPage(
    dateId: MonthDateId,
    page: Page
  ): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Navega a la página donde se listan los artículos
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Encuentro el link del artículo que me interesa
    const articleUrl = await page.evaluate((month) => {
      const anchors = Array.from(
        document.querySelectorAll('.list-archive .list-title a')
      );

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
      for (const anchor of anchors) {
        const text = anchor.textContent.trim().toUpperCase();
        if (text.startsWith(`TESLA SALES IN CHINA IN ${MONTH_MAP[month]}:`)) {
          return (anchor as HTMLAnchorElement).href;
        }
      }

      return null;
    }, month);

    // Si no encuentro el link, informo que no hay datos
    if (articleUrl === null) {
      return null;
    }

    // Navega a la página del artículo
    await page.goto(articleUrl, { waitUntil: 'networkidle2' });

    // Espero a que se cargue la tabla
    await page.waitForSelector('.tablepress');

    // Extraigo la data de la tabla es solo un objeto
    // Las ventas el mes de tesla en china
    const data = await page.evaluate(
      (year, month) => {
        const trElements = Array.from(
          document.querySelectorAll('.tablepress tbody tr')
        );
        for (const trElement of trElements) {
          const tds = Array.from(trElement.querySelectorAll('td'));
          const monthText = tds[0].textContent.trim();
          if (monthText === `${year}${month}`) {
            return {
              total: tds[1].textContent,
            };
          }
        }

        return null;
      },
      year,
      month < 10 ? `0${month}` : month // El mes debe tener 2 dígitos
    );

    if (data === null) {
      console.debug({
        year,
        month,
        articleUrl,
      });
      throw new Error('Expected data not found');
    }

    return Buffer.from(JSON.stringify(data, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    const data: IData = JSON.parse(fileData.data.toString());

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        total: z.preprocess((val: string) => {
          return parseInt(val.trim().replace(/,/g, ''), 10);
        }, z.number().int()),
      })
      .strict();

    const parsed = Schema.parse({
      year,
      month,
      total: data.total,
    });

    return [
      {
        name: 'tesla_retail',
        data: [parsed],
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
