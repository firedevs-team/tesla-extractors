import z from 'zod';
import axios from 'axios';
import puppeteer, { Browser, Page } from 'puppeteer';
import PDFParser, { Output, Text } from 'pdf2json';
import {
  BaseExtractor,
  FileData,
  FileOuput,
  MonthDateId,
} from '../../../lib/BaseExtractor';

// import path from 'path';
// import os from 'os';
// import { execSync } from 'child_process';
// import { writeFile } from 'fs/promises';

const SOURCE_URL = 'https://www.bovag.nl/pers/cijfers';

class BOVAGExtractor extends BaseExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'netherlands'],
      source: 'bovag',
      fileext: 'pdf',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    // Inicia el navegador
    const browser: Browser = await puppeteer.launch({
      headless: true, // Cambia a true si no necesitas ver la interacción
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page: Page = await browser.newPage();

    // Configura el viewport (opcional)
    await page.setViewport({ width: 1280, height: 800 });

    // Navega a la página deseada
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2' });

    // Espero 5 segundos a que cargue la página
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Le doy click al card
    await page.evaluate(() => {
      // Encuentra el card span
      const cardSpan = Array.from(document.querySelectorAll('span')).filter(
        (e) =>
          e.textContent ===
          "Verkoopcijfers personenauto's naar merk/model per maand"
      )[0];

      // El elemento padre es el card
      // le doy click al card
      cardSpan.parentElement.click();
    });

    // Espero 1 a que se expanda la lista de links
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Encuentro el link si es que existe
    // o null en caso de que no se encuentre
    const link = await page.evaluate(
      (year: number, month: number) => {
        const links = Array.from(
          document.querySelectorAll('a[class*="styles_foldout-block__"]')
        );

        const monthMap = {
          1: 'januari',
          2: 'februari',
          3: 'maart',
          4: 'april',
          5: 'mei',
          6: 'juni',
          7: 'juli',
          8: 'augustus',
          9: 'september',
          10: 'oktober',
          11: 'november',
          12: 'december',
        };

        const link = links.find((link) => {
          const text = link.querySelector('span').textContent;
          return text === `Autoverkopen ${monthMap[month]} ${year}`;
        });
        if (!link) {
          return null;
        }

        return link.getAttribute('href');
      },
      dateId.year,
      dateId.month
    );
    // Informo que no hay datos para descargar
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

    const registrations = [];
    for (let i = 0; i < pdfJSON.Pages.length; i++) {
      const texts = pdfJSON.Pages[i].Texts;

      // Armo la tabla usando las coordenadas
      const TOLERANCE = 0.048;
      const rows: Text[][] = [];
      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];

        // Busco a que row pertenece
        // Si no hay ninguno, se crea un nuevo row
        const match = rows.find((row) => {
          return Math.abs(row[0].y - text.y) <= TOLERANCE;
        });
        if (match) {
          match.push(text);
        } else {
          rows.push([text]);
        }
      }

      let modified = [...rows];
      // En la primera página tengo eliminar
      // las filas del header
      if (i === 0) {
        // Elimino rows del header
        // que termina en el row que
        // que parte con el texto "MERK%20%2F%20MODEL"
        const startIndex = modified.findIndex((row) => {
          return row[0].R[0].T === 'MERK%20%2F%20MODEL';
        });
        modified = modified.slice(startIndex + 1);
      }

      // Elimino los rows que tiene un solo elemento
      // estos son espacios al final de las páginas
      modified = modified.filter((row) => row.length > 1);

      // Valida que todas las filas tengan 5 columnas
      const tableIsValid = modified.every((row) => row.length === 5);
      if (!tableIsValid) {
        // // DEBUG CODE
        // const tmpFile2 = path.join(os.tmpdir(), `${new Date().valueOf()}.json`);
        // await writeFile(
        //   tmpFile2,
        //   JSON.stringify(
        //     {
        //       date_id: dateId,
        //       page_index: i,
        //       row_lengths: rows.map((row) => row.length),
        //       rows: rows.map((row) => {
        //         return row.map((text) => {
        //           return {
        //             x: text.x,
        //             y: text.y,
        //             text: text.R[0].T,
        //           };
        //         });
        //       }),
        //     },
        //     null,
        //     2
        //   )
        // );
        // execSync(`code ${tmpFile2}`);

        throw new Error('Invalid number of columns found');
      }

      // Valido los datos y los agrego
      // a la lista de registrations
      const Schema = z.object({
        year: z.number().int().min(1900).max(2100),
        month: z.number().int().min(1).max(12),
        model: z.preprocess((value: string) => {
          return decodeURIComponent(value).trim().toUpperCase();
        }, z.string()),
        registrations: z.preprocess((value: string) => {
          return parseInt(
            decodeURIComponent(value).trim().replace(/\./g, ''),
            10
          );
        }, z.number()),
      });
      for (const row of modified) {
        const parsed = Schema.parse({
          year: dateId.year,
          month: dateId.month,
          model: row[0].R[0].T,
          registrations: row[1].R[0].T,
        });
        registrations.push(parsed);
      }
    }

    return [
      {
        name: 'registrations_by_model',
        data: registrations,
      },
    ];
  }
}

export default new BOVAGExtractor();

// // Reindexar archivos
// setTimeout(async () => {
//   console.log('- Reindexing files...');
//   await bovagExtractor.reindex();
//   console.log('- Files reindexed');
// }, 2000);

// setTimeout(async () => {
//   console.log('- Transforming files...');

//   const dateId = { year: 2023, month: 9 };
//   const fileName = `${dateId.year}_${dateId.month}.pdf`;

//   await bovagExtractor.transform(dateId, {
//     path: path.join(bovagExtractor.downloadsPath, fileName),
//     data: Buffer.from(''),
//   });

//   console.log('- File transformed');
// }, 2000);
