import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx from 'xlsx';
import { FileData, FileOuput, MonthDateId, MonthExtractor } from '../../../lib';

const KBA_SOURCE_URL =
  'https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz10/fz10_gentab.html?nn=3514348';

class KBAExtractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'germany'],
      source: 'kba',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const html = await axios.get(KBA_SOURCE_URL);
    const $ = cheerio.load(html.data);

    // Solo necesito los primeros links
    const content = $('.links').first();
    const links: string[] = [];
    content.find('a.c-publication').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        links.push(href);
      }
    });

    // Mapeo los links para poder comparar
    const mappedLinks = links.map((link) => {
      const parts = link.split('.xlsx')[0].split('/').pop().split('_');
      const year = parseInt(parts[1]);
      const month = parseInt(parts[2]);
      return {
        url: link,
        year,
        month,
      };
    });

    // Encuentro el link que necesito
    const link = mappedLinks.find(
      (link) => link.year === dateId.year && link.month === dateId.month
    );
    if (!link) {
      // Informo que no se encontró el link
      return null;
    }

    // Descargo el archivo
    const fileContent = await axios(`https://www.kba.de${link.url}`, {
      responseType: 'arraybuffer',
    });
    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const workbook: xlsx.WorkBook = xlsx.read(fileData.data);

    // Selecciona la hoja de trabajo (worksheet)
    const worksheet: xlsx.WorkSheet = workbook.Sheets[workbook.SheetNames[3]];

    // Convierte la hoja de trabajo en un objeto JSON
    const data: any[] = xlsx.utils.sheet_to_json(worksheet);

    // Elimino los 4 primeros elementos
    data.splice(0, 5);
    // Elimino los ultimos tres elementos
    data.splice(-3);

    // Para este caso debo eliminar una fila mas inicialmente
    const firsLinexceptions = [{ year: 2023, month: 10 }];
    if (firsLinexceptions.some((e) => e.year === year && e.month === month)) {
      data.splice(0, 1);
    }

    // Para este caso debo eliminar una fila mas al final
    const endLinesExceptions = [{ year: 2023, month: 5, lines: 2 }];
    if (endLinesExceptions.some((e) => e.year === year && e.month === month)) {
      data.splice(
        -endLinesExceptions.find((e) => e.year === year && e.month === month)
          .lines
      );
    }

    const registrations = [];
    let brand: string;
    let brandKey: string;
    let modelKey: string;
    let registeredKey: string;
    let dontHaveBrand = true;
    for (const item of data) {
      const keys = Object.keys(item);

      // Por cada item defino cuales son los keys
      // de la marca, modelo y registrado

      if (brandKey === undefined || brandKey === keys[0]) {
        // Caso tiene marca
        brandKey = keys[0];
        modelKey = keys[1];
        registeredKey = keys[2];
        dontHaveBrand = false;
      } else {
        // Caso no tiene marca
        modelKey = keys[0];
        registeredKey = keys[1];
        dontHaveBrand = true;
      }

      brand = dontHaveBrand ? brand : item[brandKey];
      let model = item[modelKey];
      let registered = item[registeredKey];

      // Hay un caso en que la marca
      // es el total de todas las marcas
      if (brand.endsWith(' ZUSAMMEN')) {
        continue;
      }

      if (model === 'SONSTIGE') {
        continue;
      }

      registrations.push({
        year,
        month,
        brand: (brand + '').toUpperCase().trim(),
        model: model ? (model + '').toUpperCase().trim() : undefined,
        value: registered != '-' ? parseInt(registered) : undefined,
      });
    }

    // Ordeno los registros por año y mes
    registrations.sort((a, b) => {
      if (a.year === b.year) {
        return b.month - a.month;
      }
      return b.year - a.year;
    });

    return [
      {
        name: 'registrations_by_model',
        data: registrations,
      },
    ];
  }

  async test() {
    // await this.reindex();
  }
}

export default new KBAExtractor();
