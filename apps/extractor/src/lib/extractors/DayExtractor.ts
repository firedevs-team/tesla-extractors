import path from 'path';
import chalk from 'chalk';
import Papa from 'papaparse';
import { existsSync } from 'fs';
import { Parser } from 'json2csv';
import { readFile, writeFile } from 'fs/promises';
import { BaseExtractor, DateId, FileData, FileOuput } from './BaseExtractor';

export class DayDateId extends DateId {
  public month: number;
  public day: number;

  constructor(year: number, month: number, day: number) {
    super(year);
    this.month = month;
    this.day = day;
  }

  static fromText(text: string): DateId {
    const [year, month, day] = text.split('_').map((x) => parseInt(x));
    return new DayDateId(year, month, day);
  }

  valueOf(): number {
    return this.year * 10000 + this.month * 100 + this.day;
  }

  toString(): string {
    return `${this.year}_${this.month}_${this.day}`;
  }
}

export abstract class DayExtractor extends BaseExtractor {
  async resolveIdFromText(text: string): Promise<DateId> {
    return DayDateId.fromText(text);
  }

  abstract download(dateId: DayDateId): Promise<Buffer | null>;

  abstract transform(
    dateId: DayDateId,
    fileData: FileData
  ): Promise<FileOuput[]>;

  /**
   * Guarda la data obtenida en el archivo csv correspondiente
   *
   * Este método sobrescribe la data del mes antes guardada.
   * Esto lo hago pq la info diaria siempre es provisional
   * la que es definitiva es la mensual.
   * @param dateId
   * @param fileOutputs
   */
  async save(dateId: DayDateId, fileOutputs: FileOuput[]): Promise<void> {
    // Guardo los archivos
    for (const fileOutput of fileOutputs) {
      const filePath = path.join(this.dataPath, `${fileOutput.name}.csv`);

      let data: object[] = [];

      // Cargo el archivo csv si es que existe
      const fileExists = existsSync(filePath);
      if (fileExists) {
        // Cargo el archivo csv si es que existe
        const fileContent = await readFile(filePath, 'utf-8');
        const result = Papa.parse<object>(fileContent, {
          header: true,
          dynamicTyping: true,
        });
        data = result.data;
      }

      // Borro la data que tenga el year y el month del date id
      data = data.filter(
        (item) => item['year'] !== dateId.year || item['month'] !== dateId.month
      );

      // Agrero la nueva data
      data = [...data, ...fileOutput.data];

      // Salvo la data
      const json2csvParser = new Parser({
        fields: fileOutput.fields,
      });
      await writeFile(filePath, json2csvParser.parse(data));

      console.log(
        `> ${chalk.green(`Saved [${dateId.toString()}] ${fileOutput.name}`)}`
      );
    }
  }
}
