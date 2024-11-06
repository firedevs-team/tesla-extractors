import axios from 'axios';
import * as cheerio from 'cheerio';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://motorintelligence.com/';
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

interface RawRegistrations {
  brand: string;
  car_registrations: string;
  truck_registrations: string;
  registrations: string;
  is_estimated: boolean;
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'usa'],
      source: 'motor_intelligence',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const { data: mainPage } = await axios.get(SOURCE_URL);
    const $ = cheerio.load(mainPage);

    // En el header sobre la tabla indica el mes
    // Esto me sirve para saber que data está publicada
    const title = $('#ContentPlaceHolder1_CurrentSales1_MonthSales').text();
    const expectedTitle = `${MONTH_MAP[month]} ${year}`;
    if (title !== expectedTitle) {
      // Informo que no hay datos publicados aún
      return null;
    }

    // Cargo la tabla
    const tableElement = $(
      '#ContentPlaceHolder1_CurrentSales1_CurrentSalesGrid'
    );

    const registrations: RawRegistrations[] = [];
    Array.from(tableElement.find('tr')).forEach((row, index, array) => {
      // Ignoro el primer row pq son headers
      if (index === 0) {
        return;
      }

      // Ignoro el último row pq son footers
      if (index === array.length - 1) {
        return;
      }

      const rowData: string[] = [];
      $(row)
        .find('td')
        .each((_, cell) => {
          rowData.push($(cell).text());
        });

      const newData: RawRegistrations = {
        brand: rowData[0],
        car_registrations: rowData[1],
        truck_registrations: rowData[2],
        registrations: rowData[3],
        is_estimated: rowData[0].endsWith('*'),
      };

      registrations.push(newData);
    });

    const fileContent = JSON.stringify(registrations, null, 2);

    // Retorno buffer para cumplir con la interfaz
    return Buffer.from(fileContent, 'utf-8');
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    const rawRegistrations: RawRegistrations[] = JSON.parse(
      fileData.data.toString()
    );

    let parseInteger = (val: string) => {
      let value = val.trim();
      if (value === '') {
        return undefined;
      }

      return parseInt(value.replace(/,/g, ''), 10);
    };
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess(
          (val: string) => val.replace('*', '').trim().toUpperCase(),
          z.string()
        ),
        car_registrations: z.preprocess(
          parseInteger,
          z.number().int().optional()
        ),
        truck_registrations: z.preprocess(
          parseInteger,
          z.number().int().optional()
        ),
        registrations: z.preprocess(parseInteger, z.number().int().optional()),
        is_estimated: z.boolean(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const rawRegs of rawRegistrations) {
      const parsed = Schema.parse({
        year,
        month,
        brand: rawRegs.brand,
        car_registrations: rawRegs.car_registrations,
        truck_registrations: rawRegs.truck_registrations,
        registrations: rawRegs.registrations,
        is_estimated: rawRegs.is_estimated,
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
