import axios from 'axios';
import * as cheerio from 'cheerio';
import PDFParser, { Output, Text } from 'pdf2json';
import z from 'zod';
import {
  BaseExtractor,
  FileData,
  FileOuput,
  QuarterDateId,
} from '../../lib/BaseExtractor';

// import path from 'path';
// import os from 'os';
// import { execSync } from 'child_process';
// import { writeFile } from 'fs/promises';

const SOURCE_URL = 'https://ir.tesla.com/#quarterly-disclosure';

class ShareholderDeckExtractor extends BaseExtractor {
  constructor() {
    super({
      folders: ['tesla_ir_info'],
      source: 'shareholder_deck',
      fileext: 'pdf',
      id_format: 'quarter',
    });
  }

  async download(dateId: QuarterDateId): Promise<Buffer | null> {
    const response = await axios.get(SOURCE_URL);
    const $ = cheerio.load(response.data);

    // Obtengo las filas de la tabla
    let rows = Array.from($('.tcl-table--grouped tr'));

    // Elimino la primera fila que es el header
    rows.shift();

    // Ecuentro el link de descarga
    let link: string = null;
    for (const row of rows) {
      const cells = Array.from($(row).find('td'));

      const yearCell = cells.find((cell) => {
        return cell.attribs['style'].includes("--columnHeader: 'Year';");
      });

      const quarterCell = cells.find((cell) => {
        return cell.attribs['style'].includes("--columnHeader: 'Quarter';");
      });

      const shareholderDeckCell = cells.find((cell) => {
        return cell.attribs['style'].includes(
          "--columnHeader: 'Shareholder Deck';"
        );
      });

      const year = parseInt($(yearCell).text().trim());
      const quarter = parseInt($(quarterCell).text().trim().replace('Q', ''));

      // Encontré el archivo
      if (year === dateId.year && quarter === dateId.quarter) {
        // Hay un caso que en la tabla ya está el row del Q
        // pero solo con la informacion del press release
        // lo que significa que el link element no exite
        const linkElement = Array.from($(shareholderDeckCell).find('a'))[0];
        if (!linkElement) {
          // si no se encuentra el linkElement
          // termino el for y queda como null
          break;
        }

        link = Array.from($(shareholderDeckCell).find('a'))[0].attribs['href'];
        break;
      }
    }

    // Informo que no está publicado aún
    if (!link) {
      return null;
    }

    const fileContent = await axios(link, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: QuarterDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const outputs: FileOuput[] = [];

    // Transformo la información operacional
    const operationalOutput = await this.transformOperationalSummary(
      dateId,
      fileData
    );
    outputs.push(operationalOutput);

    // Transformo la información financiera
    const financialOutput = await this.transformFinancialSummary(
      dateId,
      fileData
    );
    outputs.push(financialOutput);

    return outputs;
  }

  async transformOperationalSummary(
    dateId: QuarterDateId,
    fileData: FileData
  ): Promise<FileOuput> {
    const data = await new Promise<Output>((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataError', (errData) =>
        reject(errData.parserError)
      );

      pdfParser.on('pdfParser_dataReady', async (pdfData) => {
        resolve(pdfData);
      });

      pdfParser.loadPDF(fileData.path);
    });

    // Encuentro la página donde está la información
    // operacional. La busco por el texto "Total%20production"
    // me quedo con la primera página que encuentre
    const page = data.Pages.find((page) => {
      return page.Texts.find((text) => {
        if (text.R[0].T === 'Total%20production') {
          return true;
        }
        return false;
      });
    });

    // Armo la tabla usando las coordenadas
    const TOLERANCE = 0.048;
    const texts = page.Texts;
    let rawTable: Text[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      // Busco a que row pertenece
      // Si no hay ninguno, se crea un nuevo row
      const match = rawTable.find((row) => {
        return Math.abs(row[0].y - text.y) < TOLERANCE;
      });
      if (match) {
        match.push(text);
      } else {
        rawTable.push([text]);
      }
    }

    let table: Text[][] = [...rawTable];

    // Elimino el header
    table.shift();

    // Solo dejo rows con 7 columnas o más
    table = table.filter((row) => row.length >= 7);

    // Extraigo la información de la tabla
    const raw: Record<string, string> = {};
    for (const row of table) {
      // Extraigo el field y el value
      let field = '';
      let value = '';
      let numPos = 0;
      for (const cell of row) {
        const decoded = decodeURIComponent(cell.R[0].T);

        // si el texto empieza con una letra
        // es el label, pero en ocasiones
        // el label está dividido en varias celdas
        if (/^[A-Za-z]/.test(decoded)) {
          field += ` ${decoded}`;
        } else if (/^[0-9]/.test(decoded)) {
          // si no entonces es un número
          // y solo me interesa el que está en la posicion 4
          numPos++;
          if (numPos === 5) {
            value = decoded;
            break;
          }
        }
      }

      // Standardizo el field
      field = field
        .trim()
        // split por espacios de cualquier tamaño
        .split(/\s+/)
        .join('_')
        // reemplazo / por _
        .replace(/\//g, '_')
        // reemplazo ( y ) por ''
        .replace(/[()]/g, '')
        .toLowerCase();

      // Lo agrego a raw
      raw[field] = value;

      // Reinicio las variables
      field = '';
      value = '';
      numPos = 0;
    }

    // Convierto el campo de storage_deployed_gwh
    // a storage_deployed_mwh prefiero que sea asi
    // para no omitir el detalle de los MWh que ahora
    // se omite
    if (raw['storage_deployed_gwh']) {
      raw['storage_deployed_mwh'] =
        raw['storage_deployed_gwh'].replace('.', ',') + '00';
      // Elimino el campo original
      delete raw['storage_deployed_gwh'];
    }

    // model_s_x_production
    // Este es un campo que se mostraba antes
    // Luego cuando se agregó el cybertruck
    // se cambió a other_models_production
    // por lo que lo voy a dejar como other_models_production
    if (raw['model_s_x_production']) {
      raw['other_models_production'] = raw['model_s_x_production'];
      delete raw['model_s_x_production'];
    }

    // model_s_x_deliveries
    // Este campo le pasó lo mismo que al anterior
    if (raw['model_s_x_deliveries']) {
      raw['other_models_deliveries'] = raw['model_s_x_deliveries'];
      delete raw['model_s_x_deliveries'];
    }

    // Este es un caso para 2023 Q2
    // Que toma el footer de la tabla
    // Solo debo eliminar un field de raw
    // q empieza así "starting_in_q1_service
    if (dateId.year === 2023 && dateId.quarter === 2) {
      const key = Object.keys(raw).find((key) => {
        return key.startsWith('starting_in_q1_service');
      });
      delete raw[key];
    }

    // Valido la información con zod
    const parseIntValue = (value: string) => {
      return parseInt(value.trim().replace(/\,/g, ''));
    };
    const Schema = z
      .object({
        year: z.number(),
        quarter: z.number(),
        model_3_y_production: z.preprocess(parseIntValue, z.number()),
        other_models_production: z.preprocess(parseIntValue, z.number()),
        total_production: z.preprocess(parseIntValue, z.number()),
        model_3_y_deliveries: z.preprocess(parseIntValue, z.number()),
        other_models_deliveries: z.preprocess(parseIntValue, z.number()),
        total_deliveries: z.preprocess(parseIntValue, z.number()),
        of_which_subject_to_operating_lease_accounting: z.preprocess(
          parseIntValue,
          z.number()
        ),
        total_end_of_quarter_operating_lease_vehicle_count: z.preprocess(
          parseIntValue,
          z.number()
        ),
        global_vehicle_inventory_days_of_supply: z.preprocess(
          parseIntValue,
          z.number()
        ),
        storage_deployed_mwh: z.preprocess(parseIntValue, z.number()),
        // Este campo ya no se está agregando
        // parece q no mueve la aguja
        // por esto esta opcional
        solar_deployed_mw: z.preprocess(parseIntValue, z.number()).optional(),
        // Este campo se empezó a agregar en 2023
        // por lo que lo dejo opcional
        tesla_locations: z.preprocess(parseIntValue, z.number()).optional(),
        mobile_service_fleet: z.preprocess(parseIntValue, z.number()),
        supercharger_stations: z.preprocess(parseIntValue, z.number()),
        supercharger_connectors: z.preprocess(parseIntValue, z.number()),
      })
      .strict();

    const parsed = Schema.parse({
      year: dateId.year,
      quarter: dateId.quarter,
      ...raw,
    });

    return {
      name: 'operational_summary',
      data: [parsed],
      fields: Object.keys(Schema.shape),
    };
  }

  async transformFinancialSummary(
    dateId: QuarterDateId,
    fileData: FileData
  ): Promise<FileOuput> {
    const data = await new Promise<Output>((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataError', (errData) =>
        reject(errData.parserError)
      );

      pdfParser.on('pdfParser_dataReady', async (pdfData) => {
        resolve(pdfData);
      });

      pdfParser.loadPDF(fileData.path);
    });

    // Encuentro la página donde está la tabla que me interesa
    // La tabla de finnancial summary
    const page = data.Pages.find((page) => {
      return page.Texts.find((text) => {
        if (text.R[0].T === 'Total%20gross%20profit') {
          return true;
        }
        return false;
      });
    });

    // Armo la tabla usando las coordenadas
    const TOLERANCE = 0.048;
    const texts = page.Texts;
    let rawTable: Text[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      // Busco a que row pertenece
      // Si no hay ninguno, se crea un nuevo row
      const match = rawTable.find((row) => {
        return Math.abs(row[0].y - text.y) < TOLERANCE;
      });
      if (match) {
        match.push(text);
      } else {
        rawTable.push([text]);
      }
    }

    let table: Text[][] = [...rawTable];

    // Elimino los primeros elementos
    // que son el header
    table.splice(0, 3);

    // Solo dejo rows con 7 columnas o más
    table = table.filter((row) => row.length >= 7);

    // Extraigo la información de la tabla
    const raw: Record<string, string> = {};
    for (const row of table) {
      // Extraigo el field
      let field = '';
      for (const cell of row) {
        const decoded = decodeURIComponent(cell.R[0].T);

        // si el texto empieza con una letra
        // o un guion es el label
        // pero en ocasiones
        // el label está dividido en varias celdas
        // por eso lo voy agrupando por el orden
        if (/^[A-Za-z-]/.test(decoded)) {
          field += ` ${decoded}`;
        } else {
          break;
        }
      }

      // Extraigo el value
      let value = '';
      let numPos = 0;
      for (const cell of row) {
        let decoded = decodeURIComponent(cell.R[0].T);

        // Me interesa el 5to número
        // el texto puede empezar con numero
        // o parentesis
        if (/^[0-9(]/.test(decoded)) {
          // Elimino los parentesis
          // si existen
          decoded = decoded.replace(/[()]/g, '');

          numPos++;
          if (numPos === 5) {
            value = decoded;
            break;
          }
        }
      }

      // Standardizo el field
      field = field
        .trim()
        // reemplazo / por _
        .replace(/\//g, '_')
        // reemplazo ( y ) por ''
        .replace(/[()]/g, '')
        // reemplazo , por ''
        .replace(/,/g, '')
        // reemplazo - por ''
        .replace(/-/g, '')
        // split por espacios de cualquier tamaño
        .split(/\s+/)
        .join('_')

        .toLowerCase();

      // Lo agrego a raw
      raw[field] = value;

      // Reseteo
      field = '';
      value = '';
      numPos = 0;
    }

    // Valido la información con zod
    const parseIntValue = (value: string) => {
      return parseInt(value.trim().replace(/\,/g, ''));
    };
    const parseFloatValue = (value: string) => {
      return parseFloat(value.trim().replace(/\,/g, '').replace(/\%/g, ''));
    };
    const Schema = z
      .object({
        year: z.number(),
        quarter: z.number(),

        total_automotive_revenues: z.preprocess(parseIntValue, z.number()),
        energy_generation_and_storage_revenue: z.preprocess(
          parseIntValue,
          z.number()
        ),
        services_and_other_revenue: z.preprocess(parseIntValue, z.number()),
        total_revenues: z.preprocess(parseIntValue, z.number()),
        total_gross_profit: z.preprocess(parseIntValue, z.number()),
        total_gaap_gross_margin: z.preprocess(parseFloatValue, z.number()),
        operating_expenses: z.preprocess(parseIntValue, z.number()),
        income_from_operations: z.preprocess(parseIntValue, z.number()),
        operating_margin: z.preprocess(parseFloatValue, z.number()),
        adjusted_ebitda: z.preprocess(parseIntValue, z.number()),
        adjusted_ebitda_margin: z.preprocess(parseFloatValue, z.number()),
        net_income_attributable_to_common_stockholders_gaap: z.preprocess(
          parseIntValue,
          z.number()
        ),
        net_income_attributable_to_common_stockholders_non_gaap: z.preprocess(
          parseIntValue,
          z.number()
        ),
        eps_attributable_to_common_stockholders_diluted_gaap: z.preprocess(
          parseFloatValue,
          z.number()
        ),
        eps_attributable_to_common_stockholders_diluted_non_gaap: z.preprocess(
          parseFloatValue,
          z.number()
        ),
        net_cash_provided_by_operating_activities: z.preprocess(
          parseIntValue,
          z.number()
        ),
        capital_expenditures: z.preprocess(parseIntValue, z.number()),
        free_cash_flow: z.preprocess(parseIntValue, z.number()),
        cash_cash_equivalents_and_investments: z.preprocess(
          parseIntValue,
          z.number()
        ),
      })
      .strict();

    const parsed = Schema.parse({
      year: dateId.year,
      quarter: dateId.quarter,
      ...raw,
    });

    // // DEBUG CODE
    // const tmpFile = path.join(os.tmpdir(), `${new Date().valueOf()}.json`);
    // await writeFile(tmpFile, JSON.stringify(parsed, null, 2));
    // execSync(`code ${tmpFile}`);

    return {
      name: 'financial_summary',
      data: [parsed],
      fields: Object.keys(Schema.shape),
    };
  }
}

export default new ShareholderDeckExtractor();

// // Reindexar archivos
// setTimeout(async () => {
//   console.log('- Reindexing files...');
//   await new TslaIRExtractor().reindex();
//   console.log('- Files reindexed');
// }, 2000);

// // Transforma un archivo dado un id de fecha
// setTimeout(async () => {
//   console.log('- Transforming files...');

//   const dateId = { year: 2023, quarter: 1 };
//   const fileName = `${dateId.year}_Q${dateId.quarter}.pdf`;

//   const extractor = new TslaIRExtractor();
//   await extractor.transform(dateId, {
//     path: path.join(extractor.downloadsPath, fileName),
//     data: Buffer.from(''),
//   });

//   console.log('- File transformed');
// }, 2000);
