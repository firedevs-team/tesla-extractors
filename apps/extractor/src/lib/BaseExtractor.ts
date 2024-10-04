import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { readdir, readFile, unlink } from 'fs/promises';
import { Parser } from 'json2csv';
import path from 'path';

const EXTRACTOR_PATH = path.join(process.cwd(), 'data', 'extractor');

export interface FileData {
  path: string;
  data: Buffer;
}

export interface FileOuput {
  name: string;
  data: any[];
  fields?: string[];
}

export interface MonthDateId {
  year: number;
  month: number;
}

export interface QuarterDateId {
  year: number;
  quarter: number;
}

type DateId = MonthDateId | QuarterDateId;

export interface Config {
  folders: string[];
  source: string;
  fileext: string;
  id_format?: 'month' | 'quarter';
}

export abstract class BaseExtractor {
  public config: Config;
  public downloadsPath: string;
  public dataPath: string;

  constructor(config: Config) {
    this.config = Object.assign({}, { id_format: 'month' }, config);
    this.downloadsPath = path.join(
      EXTRACTOR_PATH,
      path.join(...config.folders),
      'downloads',
      config.source
    );
    this.dataPath = path.join(
      EXTRACTOR_PATH,
      path.join(...config.folders),
      'data',
      config.source
    );

    // Crear directorios
    // downloads
    mkdirSync(this.downloadsPath, { recursive: true });
    // data
    mkdirSync(this.dataPath, { recursive: true });
  }

  /**
   * Extrae la informacion de la fuente
   * la transforma y la guarda en los archivos csv
   */
  async extract(): Promise<void> {
    const { folders, source, fileext, id_format } = this.config;
    const folder = path.join(...folders);

    console.log('');
    console.log(`Running [${folder}] ${source} extractor...`);

    // Siempre debe haber publicado algo asi que lo infiero
    // Determino el date id y el nombre del archivo
    // que debería estar publicado para descarga
    // los nombres varían según el formato de id
    let fileName = '';
    let dateId: DateId;
    switch (id_format) {
      case 'month': {
        const tmpDate = new Date();
        tmpDate.setMonth(tmpDate.getMonth() - 1);

        const year = tmpDate.getFullYear();
        const month = tmpDate.getMonth() + 1;

        fileName = `${year}_${month}.${fileext}`;
        dateId = { year, month };
        break;
      }
      case 'quarter': {
        const quarterMap = {
          1: 1,
          2: 1,
          3: 1,
          4: 2,
          5: 2,
          6: 2,
          7: 3,
          8: 3,
          9: 3,
          10: 4,
          11: 4,
          12: 4,
        };
        const tmpDate = new Date();
        const currentQuarter = quarterMap[tmpDate.getMonth() + 1];

        let year = tmpDate.getFullYear();
        let quarter = currentQuarter - 1;
        if (quarter === 0) {
          quarter = 4;
          year = year - 1;
        }

        fileName = `${year}_Q${quarter}.${fileext}`;
        dateId = { year, quarter };
        break;
      }
      default:
        throw new Error('Invalid id_format');
    }

    // Si ya tengo el fichero no hago nada
    const exists = existsSync(path.join(this.downloadsPath, fileName));
    if (exists) {
      console.log(`> Nothing to do`);
      return;
    }

    console.log('- Checking source...');

    // Lo mando a descargar
    let result: Buffer | null = null;
    try {
      result = await this.download(dateId);
    } catch (error) {
      console.log(`> Error downloading ${fileName}`);
      console.error(error);
      // Salta la ejecución del extractor
      // para no detener los demás, ahi debo revisar que le pasa
      return;
    }

    if (result === null) {
      console.log('> Nothing to download');
      return;
    }

    // Guardo el archivo en downloads
    // Para tener un record de lo descargado
    const filePath = path.join(this.downloadsPath, fileName);
    writeFileSync(filePath, result);

    try {
      // Lo mando a transformar
      const fileOutputs = await this.transform(dateId, {
        path: filePath,
        data: result,
      });

      // Lo mando a salvar
      await this.save(fileOutputs);
    } catch (error) {
      // Si falla la transformación o el guardado
      // elimino el archivo descargado
      // para que no quede un archivo sin procesar
      console.log('- Cleaning downloaded file...');
      await unlink(filePath);

      throw error;
    }
  }

  /**
   * Salvo los datos en los archivos csv
   * @param fileOutputs
   */
  async save(fileOutputs: FileOuput[]): Promise<void> {
    // Guardo los archivos
    for (const fileOutput of fileOutputs) {
      const filePath = path.join(this.dataPath, `${fileOutput.name}.csv`);

      const json2csvParser = new Parser({
        fields: fileOutput.fields,
      });
      const csv = json2csvParser.parse(fileOutput.data);
      const fileExists = existsSync(filePath);

      // Si el archivo existe, omito la cabecera
      let csvData = csv;
      if (fileExists) {
        csvData = `\n${csv.split('\n').slice(1).join('\n')}`;
      }

      appendFileSync(filePath, csvData);

      console.log(`> Saved ${fileOutput.name}`);
    }
  }

  /**
   * Reindexa los datos en base a los archivos de downloads
   */
  async reindex(): Promise<void> {
    const { id_format, fileext } = this.config;

    // Elimino todos los archivos de datos del source
    const files = await readdir(this.dataPath);
    for (const file of files) {
      const filePath = path.join(this.dataPath, file);
      await unlink(filePath);
    }

    // Cargo los archivos de downloads
    const downloadData: { dateId: DateId; data: Buffer }[] = [];
    let downloads = await readdir(this.downloadsPath);

    // Ignore .DS_Store files
    downloads = downloads.filter((download) => !download.startsWith('.'));

    const parseFileName = (fileName: string): DateId => {
      switch (id_format) {
        case 'month': {
          const parts = fileName.replace(`.${fileext}`, '').split('_');
          return { year: parseInt(parts[0]), month: parseInt(parts[1]) };
        }

        case 'quarter': {
          const parts = fileName.replace(`.${fileext}`, '').split('_');
          return {
            year: parseInt(parts[0]),
            quarter: parseInt(parts[1].replace('Q', '')),
          };
        }
        default:
          throw new Error('Invalid id_format');
      }
    };

    for (const fileName of downloads) {
      const buffer = await readFile(path.join(this.downloadsPath, fileName));
      downloadData.push({
        dateId: parseFileName(fileName),
        data: buffer,
      });
    }

    // Ordenos los archivos por date id
    downloadData.sort((a, b) => {
      if (a.dateId.year === b.dateId.year) {
        switch (id_format) {
          case 'month':
            return (
              (a.dateId as MonthDateId).month - (b.dateId as MonthDateId).month
            );
          case 'quarter':
            return (
              (a.dateId as QuarterDateId).quarter -
              (b.dateId as QuarterDateId).quarter
            );
          default:
            throw new Error('Invalid id_format');
        }
      }
      return a.dateId.year - b.dateId.year;
    });

    // Transformo cada uno
    const transformedData: FileOuput[] = [];
    for (const download of downloadData) {
      const { year } = download.dateId;
      const { fileext } = this.config;

      let fileName = '';
      switch (id_format) {
        case 'month':
          fileName = `${year}_${
            (download.dateId as MonthDateId).month
          }.${fileext}`;
          break;

        case 'quarter':
          fileName = `${year}_Q${
            (download.dateId as QuarterDateId).quarter
          }.${fileext}`;
          break;

        default:
          throw new Error('Invalid id_format');
      }

      const filePath = path.join(this.downloadsPath, fileName);

      const fileDatas = await this.transform(download.dateId, {
        path: filePath,
        data: download.data,
      });

      transformedData.push(...fileDatas);
    }

    // Guardo los archivos
    await this.save(transformedData);
  }

  /**
   * Descarga de la fuente
   * los datos de la fecha indicada
   * @param dateId
   * @returns Buffer | null si no hay datos
   */
  abstract download(dateId: DateId): Promise<Buffer | null>;

  /**
   * Transforma los datos descargados
   * y retorna un arreglo de FileData
   * cada fileData tiene el nombre del archivo
   * y los objetos a agregar al archivo
   * @param dateId
   * @param buffer
   */
  abstract transform(dateId: DateId, fileData: FileData): Promise<FileOuput[]>;

  /**
   * Lógica para probar el funcionamiento del extractor.
   * Se usa principalmente para construir el extractor.
   */
  async test(): Promise<void> {}
}
