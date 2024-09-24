import axios from 'axios';
import * as cheerio from 'cheerio';
import { readdir, writeFile } from 'fs/promises';
import { Parser } from 'json2csv';
import path from 'path';
import PDFParser, { Output, Text } from 'pdf2json';
import z from 'zod';
import { BaseExtractor } from '../../lib/BaseExtractor';

const SOURCE_URL = 'https://pfa-auto.fr/marche-automobile';

export class PFAExtractor extends BaseExtractor {
  constructor() {
    super('france', 'pfa');
  }

  async extract(): Promise<void> {
    // 1- Leer datos descargados previamente
    const fileNames = await readdir(this.downloadsPath);

    // 2- Analizar si deben haber nuevos datos publicados
    const today = new Date();
    // Del día 1 en adelante
    if (today.getDate() > 1) {
      // Calculo el mes pasado
      const tmpDate = new Date();
      tmpDate.setMonth(tmpDate.getMonth() - 1);
      const previousMonth = tmpDate.getMonth() + 1;

      // Busco si está descargado el fichero para el mes pasado
      const previousMonthFileName = `${tmpDate.getFullYear()}_${previousMonth}.pdf`;
      const isDownloaded = fileNames.includes(previousMonthFileName);
      if (!isDownloaded) {
        // 3- Chequear si los datos están publicados
        console.log('- Checking source...');

        const response = await axios.get(SOURCE_URL);

        const $ = cheerio.load(response.data);

        const titles = [];
        const links = [];
        const h3Elements = $('.tab-pane.active h3');
        const aElements = $('.tab-pane.active a');

        h3Elements.each((index, h3) => {
          titles.push($(h3).text().trim().toUpperCase());
        });
        aElements.each((index, a) => {
          links.push($(a).attr('href'));
        });

        // Mapeo los links para poder comparar
        const months = [
          'JANVIER',
          'FÉVRIER',
          'MARS',
          'AVRIL',
          'MAI',
          'JUIN',
          'JUILLET',
          'AOÛT',
          'SEPTEMBRE',
          'OCTOBRE',
          'NOVEMBRE',
          'DÉCEMBRE',
        ];
        const mappedLinks = titles.map((title, index) => {
          const url = links[index];
          const parts = title.split(' ');
          const month = months.indexOf(parts[0]) + 1;
          const year = parseInt(parts[1]);

          return {
            url,
            year,
            month,
          };
        });

        // Creo una lista de pendientes para descarga
        const pendingLinks = mappedLinks.filter((link) => {
          if (fileNames.includes(`${link.year}_${link.month}.pdf`)) {
            return false;
          }
          return true;
        });

        // 4- Descargar los datos
        for (const pendingLink of pendingLinks) {
          const response = await axios(pendingLink.url, {
            responseType: 'arraybuffer',
          });

          await writeFile(
            path.join(
              this.downloadsPath,
              `${pendingLink.year}_${pendingLink.month}.pdf`
            ),
            response.data
          );
        }
      }
    }

    // 5- Procesar y salvar los datos
    await this.processAndSave();
  }

  private async processAndSave(): Promise<void> {
    // Leer datos descargados
    const fileNames = await readdir(this.downloadsPath);

    // Mapeo los filenames a un objeto con year, month y name
    const mappedFiles = fileNames.map((fileName) => {
      const parts = fileName.split('_');
      return {
        year: parseInt(parts[0]),
        month: parseInt(parts[1].replace('.pdf', '')),
        name: fileName,
      };
    });

    // Ordeno los archivos por año y mes
    mappedFiles.sort((a, b) => {
      if (a.year === b.year) {
        return b.month - a.month;
      }
      return b.year - a.year;
    });

    // Proceso la información
    const registrations = [];
    for (const file of mappedFiles) {
      const downloadFilePath = path.join(this.downloadsPath, file.name);
      const pdfJSON = await new Promise<Output>((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on('pdfParser_dataError', (errData) =>
          reject(errData.parserError)
        );

        pdfParser.on('pdfParser_dataReady', async (pdfData) => {
          resolve(pdfData);
        });

        pdfParser.loadPDF(downloadFilePath);
      });

      // La tabla siempre está en la página 18
      // así reduzco el espacio de búsqueda
      const texts = pdfJSON.Pages[17].Texts;

      // Armo la tabla usando las coordenadas
      // Para crear un row necesito dejar en un arreglo
      // los que tenga la y igual o muy cercana
      const TOLERANCE = 0.02;
      let rows: Text[][] = [];
      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];

        // Busco a que row pertenece
        // Si no hay ninguno, se crea un nuevo row
        const match = rows.find((row) => {
          return Math.abs(row[0].y - text.y) < TOLERANCE;
        });
        if (match) {
          match.push(text);
        } else {
          rows.push([text]);
        }
      }

      // Hay rows que tiene 20 columnas en vez de 16
      // esto ocurre pq el primero top 10 está en negritas
      // y duplica cada texto pq es otro formato
      // si tiene length 20 elimino los ultimos 4 elementos
      rows = rows.map((row) => {
        if (row.length === 20) {
          return row.slice(0, 16);
        }
        return row;
      });

      // Dejo solo los rows que tengan 16 columnas
      rows = rows.filter((row) => row.length === 16);

      // Ordenos los rows por x
      rows = rows.map((row) => {
        return row.sort((a, b) => a.x - b.x);
      });

      // Valido los YTD Registrations con zod
      const YTDRegistrationsSchema = z.object({
        year: z.number().int().min(1900).max(2100),
        month: z.number().int().min(1).max(12),
        model: z.string(),
        ytd_registrations: z.number(),
        ytd_market_share: z.number(),
      });

      const tmpRegistrations = [];
      for (const row of rows) {
        for (let i = 0; i < row.length; i += 4) {
          const model = row[i + 1];
          const ytd_registrations = row[i + 2];
          const ytd_market_share = row[i + 3];

          const parsed = YTDRegistrationsSchema.parse({
            year: file.year,
            month: file.month,
            model: decodeURIComponent(model.R[0].T).toUpperCase(),
            ytd_registrations: parseInt(
              decodeURIComponent(ytd_registrations.R[0].T).replace(/\s/g, '')
            ),
            ytd_market_share: parseFloat(
              decodeURIComponent(ytd_market_share.R[0].T)
                .replace(',', '.')
                .replace('%', '')
            ),
          });
          tmpRegistrations.push(parsed);
        }
      }

      // Ordeno los tmp registrations por ytd_registrations
      tmpRegistrations.sort(
        (a, b) => b.ytd_registrations - a.ytd_registrations
      );

      // Finalmente los agrego a registrations
      registrations.push(...tmpRegistrations);
    }

    // const tmpFile = path.join(os.tmpdir(), `${new Date().valueOf()}.json`);
    // await writeFile(tmpFile, JSON.stringify(registrations));
    // execSync(`code ${tmpFile}`);

    // Guardar la información
    const json2csvParser = new Parser({});
    const csv = json2csvParser.parse(registrations);
    const filePath = path.join(this.dataPath, 'data.csv');
    await writeFile(filePath, csv);
    console.log(`> Data saved.`);
  }
}

export const pfaExtractor = new PFAExtractor();
