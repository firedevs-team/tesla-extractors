import { BaseExtractor, DateId, FileData, FileOuput } from './BaseExtractor';

export class QuarterDateId extends DateId {
  public quarter: number;

  constructor(year: number, quarter: number) {
    super(year);
    this.quarter = quarter;
  }

  static fromText(text: string): DateId {
    const parts = text.split('_');
    const year = parseInt(parts[0]);
    const quarter = parseInt(parts[1].replace('Q', ''));
    return new QuarterDateId(year, quarter);
  }

  valueOf(): number {
    return this.year * 10 + this.quarter;
  }

  toString(): string {
    return `${this.year}_Q${this.quarter}`;
  }
}

export abstract class QuarterExtractor extends BaseExtractor {
  /**
   * La resolución es la siguiente:
   *
   * Calculo el trimestre actual y le resto 1 trimestre.
   *
   */
  async resolveId(): Promise<DateId> {
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

    return new QuarterDateId(year, quarter);
  }

  async resolveIdFromText(text: string): Promise<DateId> {
    return QuarterDateId.fromText(text);
  }

  abstract download(dateId: QuarterDateId): Promise<Buffer | null>;

  abstract transform(
    dateId: QuarterDateId,
    fileData: FileData
  ): Promise<FileOuput[]>;
}
