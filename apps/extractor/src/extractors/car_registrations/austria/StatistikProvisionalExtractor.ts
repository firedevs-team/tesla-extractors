import z from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import {
  DateId,
  DayDateId,
  DayExtractor,
  FileData,
  FileOuput,
} from '../../../lib';

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

class StatistikProvisionalExtractor extends DayExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'austria'],
      source: 'statistik_provisional',
      fileext: 'ods',
    });
  }

  /**
   * La resolución es la siguiente:
   *
   * Los posibles ficheros son
   * 1-10
   * 1-20
   * 1-29|30|31
   *
   * si estoy en el rango del 1-9
   *  mes anterior 1-30
   * si estoy en el rango del 10-19
   *  mes actual 1-10
   * si estoy en el rango del > 20
   *  mes actual 1-20
   */
  async resolveId(): Promise<DateId> {
    const tmpDate = new Date();
    const day = tmpDate.getDate();
    if (day <= 9) {
      // Le pongo el último día del mes anterior
      tmpDate.setDate(0);

      return new DayDateId(
        tmpDate.getFullYear(),
        tmpDate.getMonth() + 1,
        tmpDate.getDate()
      );
    } else if (day <= 19) {
      return new DayDateId(tmpDate.getFullYear(), tmpDate.getMonth() + 1, 10);
    } else {
      return new DayDateId(tmpDate.getFullYear(), tmpDate.getMonth() + 1, 20);
    }
  }

  async download(dateId: DayDateId): Promise<Buffer | null> {
    const { year, month, day } = dateId;

    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);
    const links = $('#gtc-fd a');

    // Encuentro el link a descargar
    let link: string | null = null;

    let textToFind = `Tabelle: Vorläufige Kfz-Neuzulassungen 1. bis ${day}. ${MONTH_MAP[month]} ${year} nach Marke (.ods)`;
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

  async transform(dateId: DayDateId, fileData: FileData): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la primera hoja
    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Encuento la posicion de la celda
    // con el texto "Anteil in %"
    // de ahí en adelante empiezan los datos
    let fieldText = 'Anteil in %';
    const startPos = cells.find((cell) => cell.data.w === fieldText);

    // Encuentro la posición de la celda
    // con el texto "PKW INSGESAMT"
    // este sería el fin de la tabla
    const endPos = cells.find(
      (cell) => cell.data.w.toUpperCase() === 'PKW INSGESAMT'
    );

    // Me quedo con las celdas entre startPos y endPos
    cells = cells.slice(cells.indexOf(startPos) + 1, cells.indexOf(endPos));

    // Extraigo los datos de la tabla
    let raw: object[] = [];
    for (let i = 0; i < cells.length; i += 3) {
      const brand = cells[i].data.w;
      const registrations = cells[i + 1].data.v as number;
      const market_share = cells[i + 2].data.v as number;

      raw.push({ brand, registrations, market_share });
    }

    // Elimino los objetos que no tienen data
    // donde registrations es "-"
    raw = raw.filter((item) => item['registrations'] !== '-');

    // Valido la data
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        registrations: z.number().int(),
        market_share: z.number().transform((val) => parseFloat(val.toFixed(1))),
      })
      .strict();

    const registrations: object[] = [];
    for (const item of raw) {
      const parsed = Schema.parse({
        year,
        month,
        ...item,
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

  // TODO: debo sobrescribir save para que no se
  // repitan las datos provisionales, inicialmente
  // funciona pq solo tengo datos provisionales del
  // ultimos dia del mes

  async debug() {
    await this.reindex();
  }
}

export default new StatistikProvisionalExtractor();
