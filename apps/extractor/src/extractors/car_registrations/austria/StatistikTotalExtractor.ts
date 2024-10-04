import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import z from 'zod';
import {
  BaseExtractor,
  FileData,
  FileOuput,
  MonthDateId,
} from '../../../lib/BaseExtractor';

const SOURCE_URL =
  'https://www.statistik.at/statistiken/tourismus-und-verkehr/fahrzeuge/kfz-neuzulassungen';
const MONTH_MAP = {
  1: 'Jänner', // Enero (Jänner se usa en Austria)
  2: 'Februar', // Febrero
  3: 'März', // Marzo
  4: 'April', // Abril
  5: 'Mai', // Mayo
  6: 'Juni', // Junio
  7: 'Juli', // Julio
  8: 'August', // Agosto
  9: 'September', // Septiembre
  10: 'Oktober', // Octubre
  11: 'November', // Noviembre
  12: 'Dezember', // Diciembre
};

class StatistikTotalExtractor extends BaseExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'austria'],
      source: 'statistik_total',
      fileext: 'ods',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);
    const links = $('#gtc-fd a');

    // Encuentro el link a descargar
    let link: string | null = null;
    let textToFind = `Tabelle: Fahrzeug-Neuzulassungen Jänner bis ${MONTH_MAP[month]} ${year} (.ods)`;
    links.each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).find('span.ce-uploads__text').text();

      if (text === textToFind) {
        link = `https://www.statistik.at${href}`;
      }
    });

    // Informo que los datos aún no están publicados
    if (!link) {
      return null;
    }

    const fileContent = await axios(link, {
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

    // Encuentro la hoja correspondiente al mes
    const sheetName = workbook.SheetNames.find(
      (name) => name === MONTH_MAP[month]
    );

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Encuentro la posición de la celda
    // con el título que me interesa
    // y elimino las celdas anteriores
    let tableTitle =
      'Pkw-Neuzulassungen nach TOP 10 Marken und Typen mit Elektroantrieb, kumuliert';
    if (month === 1) {
      tableTitle =
        'Pkw-Neuzulassungen nach TOP 10 Marken und Typen mit Elektroantrieb';
    }
    const tableTitlePos = cells.find((cell) =>
      cell.data.w.endsWith(tableTitle)
    );
    if (!tableTitlePos) {
      throw new Error(`"${tableTitle}" not found`);
    }
    cells = cells.slice(cells.indexOf(tableTitlePos) + 1);

    // Encuentro la posición de la celda
    // con el titulo de Marke/Type
    // y elimino las celdas anteriores
    let tableHeader = 'Marke/Type';
    const startPos = cells.find((cell) => cell.data.w === tableHeader);
    if (!startPos) {
      throw new Error(`${tableHeader} not found`);
    }
    cells = cells.slice(cells.indexOf(startPos) + 1);

    // Encuentro la posición de la celda
    //con el texto "Pkw mit Elektroantrieb insgesamt"
    // este sería el fin de la tabla
    // y elimino las celdas después de esta
    let fieldText = 'Pkw mit Elektroantrieb insgesamt';
    const endPos = cells.find((cell) => cell.data.w === fieldText);
    if (!endPos) {
      throw new Error(`${fieldText} text not found`);
    }
    cells = cells.slice(0, cells.indexOf(endPos));

    // Extraigo los datos de la tabla
    const raw: object[] = [];
    for (let i = 0; i < cells.length; i += 6) {
      const model = cells[i].data.w;
      const ytd_registrations = cells[i + 1].data.v as number;
      const ytd_market_share = cells[i + 2].data.v as number;

      raw.push({ model, ytd_registrations, ytd_market_share });
    }

    // Valido la data
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z
          .string()
          .trim()
          .toUpperCase()
          .transform((val) => {
            return val.replace(/\s+/g, '_');
          }),
        ytd_registrations: z.number().int(),
        ytd_market_share: z
          .number()
          .transform((val) => parseFloat(val.toFixed(1))),
      })
      .strict();

    const ytdRegistrations: object[] = [];
    for (const item of raw) {
      const parsed = Schema.parse({
        year,
        month,
        ...item,
      });
      ytdRegistrations.push(parsed);
    }

    return [
      {
        name: 'ytd_top_12_registrations',
        data: ytdRegistrations,
      },
    ];
  }

  async test() {
    await this.reindex();
  }
}

export default new StatistikTotalExtractor();
