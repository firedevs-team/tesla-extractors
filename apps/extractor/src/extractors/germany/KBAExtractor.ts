import xlsx from 'xlsx';
import path from 'path';
import axios from 'axios';
import { Parser } from 'json2csv';
import * as cheerio from 'cheerio';
import { readdir, writeFile } from 'fs/promises';
import { BaseExtractor } from '../../lib/BaseExtractor';

const KBA_SOURCE_URL =
  'https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz10/fz10_gentab.html?nn=3514348';

export class KBAExtractor extends BaseExtractor {
  constructor() {
    super('germany', 'kba');
  }

  async extract(): Promise<void> {
    // 1- Leer datos descargados previamente
    const fileNames = await readdir(this.downloadsPath);

    // 2- Analizar si deben haber nuevos datos publicados
    const today = new Date();
    // Del día 4 en adelante, kba publica los datos del mes anterior
    if (today.getDate() > 4) {
      // Calculo el mes pasado
      const tmpDate = new Date();
      tmpDate.setMonth(tmpDate.getMonth() - 1);
      const previousMonth = tmpDate.getMonth() + 1;

      // Busco si está descargado el fichero para el mes pasado
      const previousMonthFileName = `${tmpDate.getFullYear()}_${previousMonth}.xlsx`;
      const isDownloaded = fileNames.includes(previousMonthFileName);
      if (!isDownloaded) {
        // 3- Chequear si los datos están publicados
        console.log('- Checking source...');

        const response = await axios.get(KBA_SOURCE_URL);

        const $ = cheerio.load(response.data);

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

        // Creo una lista de pendientes para descarga
        const pendingLinks = mappedLinks.filter((link) => {
          if (fileNames.includes(`${link.year}_${link.month}.xlsx`)) {
            return false;
          }
          return true;
        });

        // 4- Descargar los datos
        for (const pendingLink of pendingLinks) {
          const response = await axios(`https://www.kba.de${pendingLink.url}`, {
            responseType: 'arraybuffer',
          });

          await writeFile(
            path.join(
              this.downloadsPath,
              `${pendingLink.year}_${pendingLink.month}.xlsx`
            ),
            response.data
          );
        }
      }
    }

    // 5- Procesa y guarda los datos
    await this.processAndSave();
  }

  private async processAndSave(): Promise<void> {
    // 1- Leer datos descargados
    const fileNames = await readdir(this.downloadsPath);
    // 2- Proceso la información
    const registrations = [];
    for (const fileName of fileNames) {
      const downloadFilePath = path.join(this.downloadsPath, fileName);

      // Transformo el fichero
      const workbook: xlsx.WorkBook = xlsx.readFile(downloadFilePath);

      // Extraigo el año y mes del nombre del archivo
      const parts = path.basename(downloadFilePath).split('.')[0].split('_');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);

      // Selecciona la primera hoja de trabajo (worksheet)
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
      if (
        endLinesExceptions.some((e) => e.year === year && e.month === month)
      ) {
        data.splice(
          -endLinesExceptions.find((e) => e.year === year && e.month === month)
            .lines
        );
      }

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
    }

    // Ordeno los registros por año y mes
    registrations.sort((a, b) => {
      if (a.year === b.year) {
        return b.month - a.month;
      }
      return b.year - a.year;
    });

    // 3- Guardar la información
    const json2csvParser = new Parser({});
    const csv = json2csvParser.parse(registrations);
    const filePath = path.join(this.dataPath, 'data.csv');
    await writeFile(filePath, csv);
    console.log(`> Data saved.`);
  }
}

export const kbaExtractor = new KBAExtractor();
