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

const SOURCE_URL = 'https://www.mia.org.nz/Sales-Data/Vehicle-Sales';

/**
 * Este extractor descarga Hybrid, PHEV and EV Statistics de New Zealand
 *
 * Este extractor en la versión 2 de mia_model. Se decidió cambiar a una versión 2
 * pq se empezó a publicar un archivo totalmente nuevo, antes era un pdf ahora un xlsx
 */
class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'new_zealand'],
      source: 'mia_model_v2',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descargo la página
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    const containers = Array.from($('.DnnModule-845 .org-box'));

    // Encuento el link de descarga
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
    let downloadLink: string = null;
    for (const container of containers) {
      const text = $(container).find('h3').text().trim().toUpperCase();
      if (text === `${year}`) {
        const links = $(container).find('a');
        for (const link of links) {
          const text = $(link).text().trim().toUpperCase();
          if (text === `${MONTH_MAP[month]} ${year}`) {
            downloadLink = $(link).attr('href');
            break;
          }
        }
        break;
      }
    }

    // Informo que los datos aún no están publicados
    if (downloadLink === null) {
      return null;
    }

    // Completo la url
    downloadLink = `https://www.mia.org.nz${downloadLink}`;

    // Descargo el archivo
    const fileContent = await axios(downloadLink, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    // Cargo el archivo xlsx
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la primera hoja
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Convierto las celdas a un array
    interface Cell {
      key: string;
      data: CellObject;
    }
    const cells: Cell[] = Object.keys(sheet).map((key) => ({
      key,
      data: sheet[key],
    }));

    // Borro las celdas iniciales hasta la posición que es el inicio de la tabla
    // la posicion es la posicion de la celda que tiene el texto 'Total' + 8 columnas mas
    // Tambien las celdas finales desde que empieza la q dice "!margins"
    const startIndex = cells.findIndex((cell) => {
      return cell.data.v === 'Total';
    });
    const endIndex = cells.findIndex((cell) => {
      return cell.key === '!margins';
    });
    let data = cells.slice(startIndex + 8 + 1, endIndex);

    // Schema para validar los datos
    const Schema = z
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
        registrations: z.number().int(),
        market_share: z.number(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    // Itero los datos de a 9 posiciones que son las columnas de la tabla
    // la posicion 0 es el modelo, la 1 son los registros y la 2 es el market share
    const registrations: Registrations[] = [];
    for (let i = 0; i < data.length; i += 9) {
      const parsed = Schema.parse({
        year,
        month,
        model: data[i + 0].data.v,
        registrations: data[i + 1].data.v,
        market_share: data[i + 2].data.v,
      });
      registrations.push(parsed);
    }

    return [
      {
        name: 'registrations_by_model_v2',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
