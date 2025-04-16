import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { readdir, readFile, unlink } from 'fs/promises';
import { Parser } from 'json2csv';
import path from 'path';
import chalk from 'chalk';

const SOURCES_PATH = path.join(process.cwd(), 'data', 'sources');

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
  disabled?: boolean;
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

  equals(dateId: DateId): boolean {
    return this.valueOf() === dateId.valueOf();
  }

  greaterThan(dateId: DateId): boolean {
    return this.valueOf() > dateId.valueOf();
  }

  lessThan(dateId: DateId): boolean {
    return this.valueOf() < dateId.valueOf();
  }

  greaterOrEqualThan(dateId: DateId): boolean {
    return this.valueOf() >= dateId.valueOf();
  }

  lessOrEqualThan(dateId: DateId): boolean {
    return this.valueOf() <= dateId.valueOf();
  }
}

export abstract class BaseExtractor<C extends Config = Config> {
  public config: C;
  public downloadsPath: string;
  public dataPath: string;

  constructor(config: C) {
    this.config = config;
    this.downloadsPath = path.join(
      SOURCES_PATH,
      path.join(...config.folders),
      '_',
      config.source
    );
    this.dataPath = path.join(SOURCES_PATH, path.join(...config.folders));

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

    if (this.config.disabled) {
      console.log(`> ${chalk.gray(`Extractor ${source} is disabled`)}`);
      return;
    }

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
      console.error(error);
      console.log(`> ${chalk.red(`Error downloading ${fileName}`)}`);

      // Espero un segundo para que los errores
      // se vean antes de la ejecución del siguiente extractor
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
      await this.save(dateId, fileOutputs);
    } catch (error) {
      // Si falla la transformación o el guardado
      // elimino el archivo descargado
      // para que no quede un archivo sin procesar
      console.log('- Cleaning downloaded file...');
      await unlink(filePath);

      // Imprimo el error
      console.error(error);
      console.log(`> ${chalk.red(`Error doing transformation`)}`);

      // Salta la ejecución del extractor
      // para no detener los demás, ahi debo revisar que le pasa
      return;
    }
  }

  /**
   * Salvo los datos en los archivos csv
   * @param fileOutputs
   */
  async save(dateId: DateId, fileOutputs: FileOuput[]): Promise<void> {
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

      console.log(
        `> ${chalk.green(`Saved [${dateId.toString()}] ${fileOutput.name}`)}`
      );
    }
  }

  /**
   * Reindexa los datos en base a los archivos de downloads
   */
  async reindex(): Promise<void> {
    const { fileext } = this.config;

    // Cargo los archivos de downloads
    let downloads = await readdir(this.downloadsPath);

    // Ignore .DS_Store files y ficheros que empiezan por _
    downloads = downloads.filter(
      (download) => !(download.startsWith('.') || download.startsWith('_'))
    );

    // Creo download data que tiene mas info de los archivos
    const downloadData: { dateId: DateId; data: Buffer }[] = [];
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

    // Transformo cada archivo y lo guardo
    let deletedMap: { [key: string]: boolean } = {};
    for (const download of downloadData) {
      const { dateId, data } = download;
      const { fileext } = this.config;
      let fileName = `${dateId.toString()}.${fileext}`;
      const filePath = path.join(this.downloadsPath, fileName);

      const outputs = await this.transform(dateId, {
        path: filePath,
        data,
      });

      // Como estoy reindexando, debo sobre escribir los archivos
      // por eso elimino los archivos antes de guardar los nuevos
      // pero esto lo hago una sola vez por cada archivo
      for (const output of outputs) {
        if (!deletedMap[output.name]) {
          // Lo dejo en un try catch por si no existe el archivo
          try {
            await unlink(path.join(this.dataPath, `${output.name}.csv`));
          } catch (error) {}
          deletedMap[output.name] = true;
        }
      }

      // Guardo los archivos
      await this.save(dateId, outputs);
    }
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
  async debug(): Promise<void> {}
}
