import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.kaida.co.kr/en/statistics/NewRegistListAjax.do';
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
  brand: string;
  registrations: string;
  market_share: string;
}[];

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'south_korea'],
      source: 'kaida',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Busco el html de la tabla
    let html: string;
    try {
      const agent = new https.Agent({
        rejectUnauthorized: false, // Ignorar certificados no válidos
      });

      const headers = {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'es-ES,es;q=0.9',
        Connection: 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://www.kaida.co.kr',
        Referer: 'https://www.kaida.co.kr/en/statistics/NewRegistList.do',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'sec-ch-ua':
          '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      };

      const data = new URLSearchParams({
        programId: '117',
        layId: 'NewBrandSummary',
        searchStart: `${year}${month.toString().padStart(2, '0')}`,
        searchEnd: '',
        regionId: '',
        buytypeId: '',
      }).toString();

      const response = await axios.post(SOURCE_URL, data, {
        headers,
        httpsAgent: agent, // Usar el agente que ignora SSL
      });
      html = response.data.statistics;
    } catch (error) {
      // Si me da un error 404 informo que no hay datos
      if (error.response.status === 404) {
        return null;
      }
    }

    // Cargo el html en cheerio
    const $ = cheerio.load(html);

    // Lo primero que hago es validar que los
    // datos sean de la fecha esperada. Probé
    // con otros datos y no da 404, da datos en blanco ex: (Tesla 0 0)
    // Esta validacion es por si las moscas
    const headers = Array.from($('.statictics_list01.btmnone tbody tr'));
    if (headers.length !== 2) {
      throw new Error('Table headers not found');
    }

    const tableYear = $($(headers[0]).find('th')[1]).text();
    const tableMonth = $($(headers[1]).find('th')[0])
      .text()
      .toLowerCase()
      .replace('.', '');
    const tableDate = `${tableYear}_${tableMonth}`;
    const tableDateExpected = `${year}_${MONTH_MAP[month].toLowerCase()}`;
    if (tableDate !== tableDateExpected) {
      console.debug({
        table_date: tableDate,
        table_date_expected: tableDateExpected,
      });
      throw new Error('Table date does not match');
    }

    // Busco los rows de la tabla
    const rows = Array.from($('.statictics_list01.topnone tbody tr'));
    if (rows.length === 0) {
      throw new Error('Table rows not found');
    }

    // Agrego los datos de la tabla
    const registrations: IData = [];
    for (const row of rows) {
      const tds = Array.from($(row).find('td'));
      registrations.push({
        brand: $(tds[0]).text(),
        registrations: $(tds[1]).text(),
        market_share: $(tds[2]).text(),
      });
    }

    // Cuando se pide una fecha que no está devuelve
    // datos vacios, nombres de marca con 0 registros
    // Aki valido que el total sea mayor a 1
    const totalRegistrations = registrations.find(
      (r) => r.brand.toUpperCase() === 'TOTAL'
    );
    if (totalRegistrations.registrations === '0') {
      // Informo que no hay datos
      return null;
    }

    return Buffer.from(JSON.stringify(registrations, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    const rawData = JSON.parse(fileData.data.toString()) as IData;

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.preprocess((val: string) => {
          return val
            .trim()
            .toUpperCase()
            .replace('*', '')
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        registrations: z.preprocess((val: string) => {
          return parseInt(val.trim().replace(/,/g, ''));
        }, z.number().int()),
        market_share: z.preprocess((val: string) => {
          return parseFloat(val.trim());
        }, z.number()),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const item of rawData) {
      const parsed = Schema.parse({
        year,
        month,
        brand: item.brand,
        registrations: item.registrations,
        market_share: item.market_share,
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
