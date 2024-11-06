import {
  BaseExtractor,
  Config,
  DateId,
  FileData,
  FileOuput,
} from './BaseExtractor';

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
}
