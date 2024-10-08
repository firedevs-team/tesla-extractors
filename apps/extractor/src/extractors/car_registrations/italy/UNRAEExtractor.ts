import axios from 'axios';
import * as cheerio from 'cheerio';
import PDFParser, { Output, Text } from 'pdf2json';
import z from 'zod';
import { FileData, FileOuput, MonthDateId, MonthExtractor } from '../../../lib';

const SOURCE_URL = 'https://unrae.it/dati-statistici/immatricolazioni?page=1';

class UNRAEExtractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'italy'],
      source: 'unrae',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const html = await axios.get(SOURCE_URL);
    const $ = cheerio.load(html.data);

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

    // Busco el link que corresponde al mes y año
    const link = mappedLinks.find(
      (link) => link.year === dateId.year && link.month === dateId.month
    );

    // Informo que no se encontró el link
    if (!link) {
      return null;
    }

    const fileContent = await axios(link.url, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const pdfJSON = await new Promise<Output>((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataError', (errData) =>
        reject(errData.parserError)
      );

      pdfParser.on('pdfParser_dataReady', async (pdfData) => {
        resolve(pdfData);
      });

      pdfParser.loadPDF(fileData.path);
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

    const registrations = [];
    for (const row of rows) {
      const lastPosition = row.length - 1;

      // El parse de Zod realiza la transformación y validación
      const parsed = YTDRegistrationsSchema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: row[1].R[0].T,
        model: row[2].R[0].T,
        ytd_registrations: row[lastPosition - 1].R[0].T,
        ytd_market_share: row[lastPosition].R[0].T,
      });

      registrations.push(parsed);
    }

    // Ordeno los tmp registrations por ytd_registrations
    registrations.sort((a, b) => b.ytd_registrations - a.ytd_registrations);

    return [
      {
        name: 'ytd_registrations_by_model',
        data: registrations,
      },
    ];
  }

  async test() {
    // await this.reindex();
  }
}

export default new UNRAEExtractor();
