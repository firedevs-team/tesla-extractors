import { BaseExtractor, DateId, FileData, FileOuput } from './BaseExtractor';

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

export abstract class MonthExtractor extends BaseExtractor {
  /**
   * La resolución es la siguiente:
   *
   * Al mes actual se le resta 1 mes.
   *
   */
  async resolveId(): Promise<DateId> {
    const tmpDate = new Date();
    tmpDate.setMonth(tmpDate.getMonth() - 1);

    const year = tmpDate.getFullYear();
    const month = tmpDate.getMonth() + 1;

    return new MonthDateId(year, month);
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
