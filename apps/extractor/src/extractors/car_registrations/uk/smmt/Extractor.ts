import AdmZip from 'adm-zip';
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

const SOURCE_URL = 'https://www.smmt.co.uk/category/news/registrations/';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'uk'],
      source: 'smmt',
      fileext: 'xls',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const zipBuffer = await this.donwloadZip(dateId);
    if (!zipBuffer) {
      return null;
    }

    // Ahora necesito cargar el zip en memoria
    // encontrar el archivo xls y retornar el buffer
    // del archivo xls
    const zip = new AdmZip(zipBuffer);

    let xlsBuffer: Buffer;
    zip.getEntries().forEach((entry) => {
      if (entry.entryName.endsWith('.xls')) {
        xlsBuffer = entry.getData();
      }
    });

    if (!xlsBuffer) {
      throw new Error('Xls file not found in zip');
    }

    return xlsBuffer;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la primera hora
    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    // Me con el contenido de la tabla
    const startPos = cells.findIndex((cell) => cell.data.v === 'MARQUE');
    const endPos = cells.findIndex((cell) => cell.data.w === 'Total');
    cells = cells.slice(startPos + 8 + 1, endPos);

    // Extraigo la información de la tabla
    const raw: {
      brand: string;
      registrations: number;
      market_share: number;
    }[] = [];
    for (let i = 0; i < cells.length; i++) {
      // Si el tipo es un string es una marca
      if (cells[i].data.t === 's') {
        const brand = cells[i].data.v;
        const keyIndex = cells[i].key.replace(/[A-Z]/g, '');
        const registrations =
          cells.find((c) => c.key === `B${keyIndex}`)?.data.v || 0;
        // Si los registros son 0 los ignoro
        if (registrations === 0) {
          continue;
        }
        const market_share = cells.find((c) => c.key === `C${keyIndex}`).data.v;
        raw.push({
          brand: brand as string,
          registrations: registrations as number,
          market_share: market_share as number,
        });
      }
    }

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        registrations: z.number().int(),
        market_share: z.number(),
      })
      .strict();

    type IRegistrations = z.infer<typeof Schema>;
    const registrations: IRegistrations[] = [];
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

  async debug() {}

  private async donwloadZip(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const { data: mainPage } = await axios.get(SOURCE_URL);
    const $page = cheerio.load(mainPage);

    // Obtengo los links y fechas de las reportes
    const reportsLinks = Array.from($page('.tw-space-y-6 .title a')).map(
      (e) => {
        return $page(e).attr('href');
      }
    );
    const reportsDates = Array.from($page('.tw-space-y-6 .time')).map((e) => {
      return new Date($page(e).text().trim());
    });

    if (reportsLinks.length !== reportsDates.length) {
      throw new Error('The number of links and dates does not match');
    }

    // Encuentro el link del reporte q me interesa
    // month es 0-indexed por lo que no hay q sumarle 1
    let reportLink: string | null = null;
    const publicationDateToDownload = new Date(year, month, 1);
    for (let i = 0; i < reportsLinks.length; i++) {
      const reportDate = reportsDates[i];
      if (reportDate >= publicationDateToDownload) {
        // Siempre almaceno el último link que cumple la condición
        // porque el reporte es lo primero q se publica en el mes
        reportLink = reportsLinks[i];
      } else {
        break;
      }
    }

    // Si no existe informo que los datos aún no están publicados
    if (!reportLink) {
      return null;
    }

    // Descargo el reporte donde están el link de descarga
    const response = await axios.get(reportLink);
    const $ = cheerio.load(response.data);

    // Encuentro el link de descarga
    let downloadLink: string;
    $('.post-entry a.btn_sml').each((_, e) => {
      const text = $(e).text().trim();
      if (text === 'DOWNLOAD PRESS RELEASE AND DATA TABLE') {
        downloadLink = $(e).attr('href');
      }
    });

    if (!downloadLink) {
      throw new Error('Download link not found');
    }

    // Descargo el zip
    const fileContent = await axios(downloadLink, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }
}

export default new Extractor();
