import { BaseAccumulator } from '../lib/BaseAccumulator';

interface Sale {
  year: number;
  month: number;
  value: number;
}

export class CNEVTeslaExportAccumulator extends BaseAccumulator<Sale> {
  constructor() {
    super('cnev-tesla-export', 'https://cnevdata.com/');
  }

  protected async transform(filePath: string): Promise<Sale[]> {
    return [];
  }
}
