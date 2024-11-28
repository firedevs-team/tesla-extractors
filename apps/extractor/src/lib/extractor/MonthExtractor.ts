import path from 'path';
import {
  BaseExtractor,
  Config,
  DateId,
  FileData,
  FileOuput,
} from './BaseExtractor';
import fs from 'fs';
import { readFile, writeFile } from 'fs/promises';
import Papa from 'papaparse';
import { Parser } from 'json2csv';
import chalk from 'chalk';

interface MonthData {
  year: number;
  month: number;
}

interface MonthConfig extends Config {
  published_day?: number;
}

export class MonthDateId extends DateId {
  public month: number;

  constructor(year: number, month: number) {
    super(year);
    this.month = month;
  }

  static fromText(text: string): DateId {
    const [year, month] = text.split('_').map((x) => parseInt(x));
    return new MonthDateId(year, month);
  }

  valueOf(): number {
    return this.year * 100 + this.month;
  }

  toString(): string {
    return `${this.year}_${this.month}`;
  }
}

export abstract class MonthExtractor extends BaseExtractor<MonthConfig> {
  constructor(config: MonthConfig) {
    super(Object.assign({}, { published_day: 1 }, config));
  }
  /**
   * La resolución es la siguiente:
   *
   * Si es ya es el published_day, entonces se resuelvo el mes anterior.
   * Si no, se resuelve el mes antes del anterior.
   *
   */
  async resolveId(): Promise<DateId> {
    const tmpDate = new Date();

    const publishedDay = this.config.published_day;
    if (tmpDate.getDate() >= publishedDay) {
      // Resuelvo el mes anterior
      tmpDate.setMonth(tmpDate.getMonth() - 1);

      const year = tmpDate.getFullYear();
      const month = tmpDate.getMonth() + 1;

      return new MonthDateId(year, month);
    } else {
      // Resuelvo el mes antes del anterior
      tmpDate.setMonth(tmpDate.getMonth() - 2);

      const year = tmpDate.getFullYear();
      const month = tmpDate.getMonth() + 1;

      return new MonthDateId(year, month);
    }
  }

  async resolveIdFromText(text: string): Promise<DateId> {
    return MonthDateId.fromText(text);
  }

  abstract download(dateId: MonthDateId): Promise<Buffer | null>;

  abstract transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]>;

  async reindex(): Promise<void> {
    await super.reindex();

    // Debo agregar _other_data.json al output
    const otherDatafileName = '_other_data.json';
    const otherDataPath = path.join(this.downloadsPath, otherDatafileName);
    if (fs.existsSync(otherDataPath)) {
      const otherDataRaw = await readFile(otherDataPath, 'utf-8');
      const otherData: Record<string, MonthData[]> = JSON.parse(otherDataRaw);

      for (const key of Object.keys(otherData)) {
        const outputPath = path.join(this.dataPath, `${key}.csv`);
        const outputRaw = await readFile(outputPath, 'utf-8');
        const outputParsed = Papa.parse<MonthData>(outputRaw, {
          header: true,
          dynamicTyping: true,
        });

        const otherOutputData = otherData[key];
        const finalData = [...outputParsed.data, ...otherOutputData]
          // Ordeno por año y mes
          .sort((a, b) => {
            if (a.year === b.year) {
              return a.month - b.month;
            }

            return a.year - b.year;
          });

        const json2csvParser = new Parser({});
        const csv = json2csvParser.parse(finalData);
        await writeFile(outputPath, csv);

        console.log(`> ${chalk.green(`Saved [${otherDatafileName}] ${key}`)}`);
      }
    }
  }

  private async debugDownload(year: number, month: number) {
    const dateId = new MonthDateId(year, month);
    const result = await this.download(dateId);
    if (result === null) {
      console.log('> No data available');
      return;
    }

    const filePath = path.join(
      this.downloadsPath,
      `${dateId.toString()}.${this.config.fileext}`
    );
    await writeFile(filePath, result);
    console.log(`> File saved at ${filePath}`);
  }

  private async debugTransform(year: number, month: number) {
    const dateId = new MonthDateId(year, month);
    const filePath = path.join(
      this.downloadsPath,
      `${dateId.toString()}.${this.config.fileext}`
    );
    const fileData = await readFile(filePath);
    await this.transform(dateId, { path: filePath, data: fileData });
    console.log(`> Data transformed ${dateId.toString()}`);
  }
}
