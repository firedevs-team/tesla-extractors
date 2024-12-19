import {
  AnalyzeDocumentCommand,
  Block,
  TextractClient,
} from '@aws-sdk/client-textract';
import axios from 'axios';
import * as cheerio from 'cheerio';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://www.smmt.co.uk/category/news/registrations/';

/**
 * Extractor de los top modelos vendidos en el Reino Unido
 *
 * TODO: mejorar la extracción de la imagen usando esta fuente mejor
 * https://www.smmt.co.uk/vehicle-data/car-registrations/
 * Aqui puedo sacar la cantidad por powertrain
 */
class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'uk'],
      source: 'smmt_model',
      fileext: 'png',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
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

    // Obtengo el src de la imagen de best sellers
    const images = $('.text img');
    const lastImage = images.last();

    let src = lastImage.attr('data-lazy-src');
    if (!src) {
      src = lastImage.attr('src');
    }

    // Valido q sea el src correcto
    if (!src.endsWith('best-sellers_cars.png')) {
      throw new Error('The image is not the best sellers');
    }

    // Descargo la imagen
    const imageResponse = await axios(src, {
      responseType: 'arraybuffer',
    });

    return imageResponse.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    // Envio la imagen a textract
    const textractClient = new TextractClient({ region: 'us-east-1' });
    const command = new AnalyzeDocumentCommand({
      Document: {
        Bytes: fileData.data,
      },
      FeatureTypes: ['FORMS'],
    });
    const response = await textractClient.send(command);

    // Me quedo con los bloques de tipo Word
    let wordBlocks = response.Blocks.filter(
      (block) => block.BlockType === 'WORD'
    );

    // Elimino todos los bloques hasta que encuentre el bloque con el indice 1
    // que es el que indica el inicio de la tabla
    while (wordBlocks.length > 0 && wordBlocks[0].Text !== '1') {
      wordBlocks.shift();
    }

    // Creo rows con cada wordBlock
    // para saber que pertenecen a la misma fila
    // uso el top de cada wordBlock
    const rows: Block[][] = [];
    for (const wordBlock of wordBlocks) {
      const top = wordBlock.Geometry.BoundingBox.Top;
      // Busco la fila a la que pertenece
      let row = rows.find((row) => {
        return row.some((block) => {
          return Math.abs(block.Geometry.BoundingBox.Top - top) < 0.01;
        });
      });
      if (!row) {
        rows.push([wordBlock]);
      } else {
        row.push(wordBlock);
      }
    }

    // Extraigo las dos tablas que voy a indexar
    // Los best sellers y year to date
    let table1: string[][] = [];
    let table2: string[][] = [];
    let isTable1 = true;
    for (const row of rows) {
      let rowTable1: string[] = [];
      let rowTable2: string[] = [];
      for (const cell of row) {
        if (isTable1) {
          rowTable1.push(cell.Text);
        } else {
          rowTable2.push(cell.Text);
        }

        // Identifico si cambio de tabla
        const number = Number(cell.Text.replace(',', ''));
        const isNumber = !isNaN(number);
        const hasComma = cell.Text.includes(',');
        if (isNumber && number > 10 && hasComma) {
          if (isTable1) {
            table1.push(rowTable1);
          } else {
            table2.push(rowTable2);
          }

          // Alterno la tabla
          isTable1 = !isTable1;
        }
      }
    }

    // Uso el mismo schema para ambas tablas
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.string().trim().toUpperCase(),
        registrations: z.preprocess(
          (val: string) => parseInt(val.replace(/,/g, ''), 10),
          z.number().int()
        ),
      })
      .strict();

    // Valido la data de la tabla 1
    const top_10_models_output: FileOuput = {
      name: 'top_10_registrations_by_model',
      data: [],
    };
    for (const row of table1) {
      const model = row.slice(1, row.length - 1).join(' ');
      const registrations = row[row.length - 1];

      const parsed = Schema.parse({
        year,
        month,
        model,
        registrations,
      });

      top_10_models_output.data.push(parsed);
    }

    // Valido la data de la tabla 2
    const top_10_ytd_models_output: FileOuput = {
      name: 'top_10_ytd_registrations_by_model',
      data: [],
    };
    for (const row of table2) {
      const model = row.slice(1, row.length - 1).join(' ');
      const registrations = row[row.length - 1];

      const parsed = Schema.parse({
        year,
        month,
        model,
        registrations,
      });

      top_10_ytd_models_output.data.push(parsed);
    }

    return [top_10_models_output, top_10_ytd_models_output];
  }

  async debug() {}
}

export default new Extractor();
