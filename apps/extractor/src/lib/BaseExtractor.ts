import path from 'path';
import { Parser } from 'json2csv';
import { mkdirSync, existsSync, appendFileSync, writeFileSync } from 'fs';
import { readdir, unlink, readFile } from 'fs/promises';

const EXTRACTOR_PATH = path.join(process.cwd(), 'data', 'extractor');

export interface FileData {
  path: string;
  data: Buffer;
}

export interface FileOuput {
  name: string;
  data: any[];
}

export interface DateId {
  year: number;
  month: number;
}

export interface Config {
  folder: string;
  source: string;
  fileext: string;
}

export abstract class BaseExtractor {
  protected config: Config;
  public downloadsPath: string;
  protected dataPath: string;

  constructor(config: Config) {
    this.config = config;
    this.downloadsPath = path.join(
      EXTRACTOR_PATH,
      config.folder,
      'downloads',
      config.source
    );
    this.dataPath = path.join(
      EXTRACTOR_PATH,
      config.folder,
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
    const { folder, source, fileext } = this.config;

    console.log(`Running [${folder}] ${source} extractor...`);

    // Analizo si me falta lo nuevo
    const today = new Date();
    if (today.getDate() > 1) {
      // Calculo el mes pasado
      const tmpDate = new Date();
      tmpDate.setMonth(tmpDate.getMonth() - 1);
      const previousMonth = tmpDate.getMonth() + 1;

      const fileName = `${tmpDate.getFullYear()}_${previousMonth}`;
      const fileNameWithExt = `${fileName}.${fileext}`;

      // Si ya tengo el fichero no hago nada
      const exists = existsSync(path.join(this.downloadsPath, fileNameWithExt));
      if (exists) {
        return;
      }

      console.log('- Checking source...');

      // Lo mando a descargar
      const dateId: DateId = {
        year: tmpDate.getFullYear(),
        month: previousMonth,
      };
      let result: Buffer | null = null;
      try {
        result = await this.download(dateId);
      } catch (error) {
        console.log(`> Error downloading ${fileNameWithExt}`);
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
      const filePath = path.join(this.downloadsPath, `${fileNameWithExt}`);
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
        console.log('- Deleting downloaded file...');
        await unlink(filePath);

        throw error;
      }
    }
  }

  /**
   * Salvo los datos en los archivos csv
   * @param fileOutputs
   */
  async save(fileOutputs: FileOuput[]): Promise<void> {
    // Guardo los archivos
    for (const fileOutput of fileOutputs) {
      console.log(`- Saving ${fileOutput.name}...`);

      const filePath = path.join(this.dataPath, `${fileOutput.name}.csv`);

      const json2csvParser = new Parser({});
      const csv = json2csvParser.parse(fileOutput.data);
      const fileExists = existsSync(filePath);

      // Si el archivo existe, omito la cabecera
      let csvData = csv;
      if (fileExists) {
        csvData = `\n${csv.split('\n').slice(1).join('\n')}`;
      }

      appendFileSync(filePath, csvData);
    }
  }

  /**
   * Reindexa los datos en base a los archivos de downloads
   */
  async reindex(): Promise<void> {
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

    for (const download of downloads) {
      const buffer = await readFile(path.join(this.downloadsPath, download));
      downloadData.push({
        dateId: {
          year: parseInt(download.split('_')[0]),
          month: parseInt(download.split('_')[1].split('.')[0]),
        },
        data: buffer,
      });
    }

    // Ordenos los archivos por date id
    downloadData.sort((a, b) => {
      if (a.dateId.year === b.dateId.year) {
        return a.dateId.month - b.dateId.month;
      }
      return a.dateId.year - b.dateId.year;
    });

    // Transformo cada uno
    const transformedData: FileOuput[] = [];
    for (const download of downloadData) {
      const { year, month } = download.dateId;
      const { fileext } = this.config;
      const filePath = path.join(
        this.downloadsPath,
        `${year}_${month}.${fileext}`
      );

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
}
