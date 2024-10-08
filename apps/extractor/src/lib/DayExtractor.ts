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
}
