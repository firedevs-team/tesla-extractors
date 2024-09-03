import { BaseAccumulator } from '../lib/BaseAccumulator';

interface Sale {
  year: number;
  month: number;
  value: number;
}

export class CNEVTeslaRetailAccumulator extends BaseAccumulator<Sale> {
  constructor() {
    super('cnev-tesla-retail', 'https://cnevdata.com/');
  }

  protected async transform(filePath: string): Promise<Sale[]> {
    return [];
  }
}
