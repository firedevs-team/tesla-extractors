import path from 'path';
import xlsx from 'xlsx';
import { BaseAccumulator } from '../lib/BaseAccumulator';

// TODO: extract power trains
// Power Trains
// SAE J1715
// ICE, HEV, PHEV, BEV, FCEV

interface Sale {
  year: number;
  month: number;
  brand: string;
  model?: string;
  value?: number;
}

export class KBAAccumulator extends BaseAccumulator<Sale> {
  constructor() {
    super(
      'kba',
      'https://www.kba.de/DE/Statistik/Fahrzeuge/Neuzulassungen/MonatlicheNeuzulassungen/monatliche-neuzulassungen_node.html'
    );
  }

  protected async transform(filePath: string): Promise<Sale[]> {
    const sales: Sale[] = [];
    const workbook: xlsx.WorkBook = xlsx.readFile(filePath);

    // Extraigo el año y mes del nombre del archivo
    const parts = path.basename(filePath).split('.')[0].split('_');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);

    // Selecciona la primera hoja de trabajo (worksheet)
    const worksheet: xlsx.WorkSheet = workbook.Sheets[workbook.SheetNames[3]];

    // Convierte la hoja de trabajo en un objeto JSON
    const data: any[] = xlsx.utils.sheet_to_json(worksheet);

    // Elimino los 4 primeros elementos
    data.splice(0, 5);
    // Elimino los ultimos tres elementos
    data.splice(-3);

    // Para este caso debo eliminar una fila mas inicialmente
    const firsLinexceptions = [{ year: 2023, month: 10 }];
    if (firsLinexceptions.some((e) => e.year === year && e.month === month)) {
      data.splice(0, 1);
    }

    // Para este caso debo eliminar una fila mas al final
    const endLinesExceptions = [{ year: 2023, month: 5, lines: 2 }];
    if (endLinesExceptions.some((e) => e.year === year && e.month === month)) {
      data.splice(
        -endLinesExceptions.find((e) => e.year === year && e.month === month)
          .lines
      );
    }

    let brand: string;

    let brandKey: string;
    let modelKey: string;
    let registeredKey: string;
    let dontHaveBrand = true;
    for (const item of data) {
      const keys = Object.keys(item);

      // Por cada item defino cuales son los keys
      // de la marca, modelo y registrado

      if (brandKey === undefined || brandKey === keys[0]) {
        // Caso tiene marca
        brandKey = keys[0];
        modelKey = keys[1];
        registeredKey = keys[2];
        dontHaveBrand = false;
      } else {
        // Caso no tiene marca
        modelKey = keys[0];
        registeredKey = keys[1];
        dontHaveBrand = true;
      }

      brand = dontHaveBrand ? brand : item[brandKey];
      let model = item[modelKey];
      let registered = item[registeredKey];

      // Hay un caso en que la marca
      // es el total de todas las marcas
      if (brand.endsWith(' ZUSAMMEN')) {
        continue;
      }

      if (model === 'SONSTIGE') {
        continue;
      }

      sales.push({
        year,
        month,
        brand: (brand + '').toUpperCase().trim(),
        model: model ? (model + '').toUpperCase().trim() : undefined,
        value: registered != '-' ? parseInt(registered) : undefined,
      });
    }

    return sales;
  }
}
