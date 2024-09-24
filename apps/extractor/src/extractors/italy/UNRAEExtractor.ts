import axios from 'axios';
import cheerio from 'cheerio';
import { readdir, writeFile } from 'fs/promises';
import { Parser } from 'json2csv';
import path from 'path';
import PDFParser, { Output, Text } from 'pdf2json';
import z from 'zod';
import { BaseExtractor } from '../../lib/BaseExtractor';
import os from 'os';
import { execSync } from 'child_process';

const SOURCE_URL = 'https://unrae.it/dati-statistici/immatricolazioni?page=1';

export class UNRAEExtractor extends BaseExtractor {
  constructor() {
    super('italy', 'unrae');
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

        // Extraigo los links de la primera página
        let links: { text: string; href: string }[] = [];
        $(`.cat_art_container a`).each((_, element) => {
          const text = $(element).text().trim();
          const href = $(element).attr('href') || '';
          links.push({ text, href });
        });

        // Me quedo solo el link que me intersa que empiezan con
        // Immatricolazioni BEV per modello - Agosto 2024
        links = links.filter((link) => {
          return link.text.startsWith('Immatricolazioni BEV per modello');
        });

        // Mapeo los links para poder comparar
        const months = [
          'GENNAIO',
          'FEBBRAIO',
          'MARZO',
          'APRILE',
          'MAGGIO',
          'GIUGNO',
          'LUGLIO',
          'AGOSTO',
          'SETTEMBRE',
          'OTTOBRE',
          'NOVEMBRE',
          'DICEMBRE',
        ];
        const mappedLinks = await Promise.all(
          links.map(async (link, index) => {
            const parts = link.text.split('-')[1].trim().split(' ');
            const month = months.indexOf(parts[0].toUpperCase()) + 1;
            const year = parseInt(parts[1]);

            // La url que aparece en la página
            // no es la misma que la que se descarga
            // Tengo q abrir esa página y extraer el link

            const response = await axios.get(link.href);
            const $ = cheerio.load(response.data);

            // Busco los links dentro de div .unrae_art_box
            let hrefs: string[] = [];
            $(`.unrae_art_box a`).each((_, element) => {
              const href = $(element).attr('href') || '';
              hrefs.push(href);
            });

            // Me quedo con el segundo link encontrado
            // que es el que tiene el pdf
            return {
              url: hrefs[1],
              year,
              month,
            };
          })
        );

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
      // console.log(`- Processing ${file.name}...`);

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

      // Me quedo con los textos de la primera página
      const texts = pdfJSON.Pages[0].Texts;

      // Armo la tabla usando las coordenadas
      // Para crear un row necesito dejar en un arreglo
      // los que tenga la y igual o muy cercana
      const TOLERANCE = 0.036;
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

      // Ordenos los rows por x
      rows = rows.map((row) => {
        return row.sort((a, b) => a.x - b.x);
      });

      // Elimino los row que el primer texto no es un número
      // ya que los rows que necesito empiezan un indice
      rows = rows.filter((row) => {
        return !isNaN(parseInt(decodeURIComponent(row[0].R[0].T)));
      });

      // Valido los YTD Registrations con zod
      const YTDRegistrationsSchema = z.object({
        year: z.number().int().min(1900).max(2100),
        month: z.number().int().min(1).max(12),
        brand: z.preprocess((value: string) => {
          // Decodifica, limpia y convierte a mayúsculas
          return decodeURIComponent(value).trim().toUpperCase();
        }, z.string()),

        model: z.preprocess((value: string) => {
          // Decodifica, limpia y convierte a mayúsculas
          return decodeURIComponent(value).trim().toUpperCase();
        }, z.string()),

        ytd_registrations: z.preprocess((value: string) => {
          // Decodifica, limpia, elimina puntos y convierte a número entero
          return parseInt(
            decodeURIComponent(value).trim().replace(/\./g, ''),
            10
          );
        }, z.number()),

        ytd_market_share: z.preprocess((value: string) => {
          // Decodifica y convierte a número flotante
          return parseFloat(decodeURIComponent(value).trim().replace(',', '.'));
        }, z.number()),
      });

      const tmpRegistrations = [];
      for (const row of rows) {
        const lastPosition = row.length - 1;

        // El parse de Zod realiza la transformación y validación
        const parsed = YTDRegistrationsSchema.parse({
          year: file.year,
          month: file.month,
          brand: row[1].R[0].T,
          model: row[2].R[0].T,
          ytd_registrations: row[lastPosition - 1].R[0].T,
          ytd_market_share: row[lastPosition].R[0].T,
        });

        tmpRegistrations.push(parsed);
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

export const unraeExtractor = new UNRAEExtractor();
