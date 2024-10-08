import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { readdir, readFile, unlink } from 'fs/promises';
import { Parser } from 'json2csv';
import path from 'path';
import chalk from 'chalk';

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

export interface Config {
  folders: string[];
  source: string;
  fileext: string;
}

export class DateId {
  public year: number;

  constructor(year: number) {
    this.year = year;
  }

  static fromText(text: string): DateId {
    const year = parseInt(text);
    return new DateId(year);
  }

  valueOf(): number {
    return this.year;
  }

  toString(): string {
    return this.year.toString();
  }
}

export abstract class BaseExtractor {
  public config: Config;
  public downloadsPath: string;
  public dataPath: string;

  constructor(config: Config) {
    this.config = config;
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
   * Infiere por la fecha que id debería
   * estar publicado en la fuente.
   */
  abstract resolveId(): Promise<DateId>;

  /**
   * Resuelve el id de la fecha a partir de un texto
   * @param text
   */
  abstract resolveIdFromText(text: string): Promise<DateId>;

  /**
   * Extrae la informacion de la fuente
   * la transforma y la guarda en los archivos csv
   */
  async extract(): Promise<void> {
    const { folders, source, fileext } = this.config;
    const folder = path.join(...folders);

    console.log('');
    console.log(`Running [${folder}] ${source} extractor...`);

    const dateId = await this.resolveId();
    const fileName = `${dateId.toString()}.${fileext}`;

    // Si ya tengo el fichero no hago nada
    const exists = existsSync(path.join(this.downloadsPath, fileName));
    if (exists) {
      console.log(`> ${chalk.gray(`File ${fileName} already downloaded`)}`);
      return;
    }

    console.log('- Checking source...');

    // Lo mando a descargar
    let result: Buffer | null = null;
    try {
      result = await this.download(dateId);
    } catch (error) {
      console.log(`> ${chalk.red(`Error downloading ${fileName}`)}`);
      console.error(error);
      // Salta la ejecución del extractor
      // para no detener los demás, ahi debo revisar que le pasa
      return;
    }

    if (result === null) {
      console.log(`> ${chalk.yellow(`Data ${fileName} not published yet`)}`);
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

      console.log(`> ${chalk.green(`Saved ${fileOutput.name}`)}`);
    }
  }

  /**
   * Reindexa los datos en base a los archivos de downloads
   */
  async reindex(): Promise<void> {
    const { fileext } = this.config;

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

    for (const fileName of downloads) {
      const buffer = await readFile(path.join(this.downloadsPath, fileName));
      const dateId = await this.resolveIdFromText(
        fileName.replace(`.${fileext}`, '')
      );
      downloadData.push({
        dateId,
        data: buffer,
      });
    }

    // Ordenos los archivos por date id
    downloadData.sort((a, b) => {
      return a.dateId.valueOf() - b.dateId.valueOf();
    });

    // Transformo cada uno
    const transformedData: FileOuput[] = [];
    for (const download of downloadData) {
      const { fileext } = this.config;
      let fileName = `${download.dateId.toString()}.${fileext}`;
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
