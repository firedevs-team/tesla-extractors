import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { BaseAccumulator } from '../lib/BaseAccumulator';

const openai = new OpenAI();

const REGIONS = [
  'AUSTRIA',
  'BELGIUM',
  'BULGARIA',
  'CROATIA',
  'CYPRUS',
  'CZECH REPUBLIC',
  'DENMARK',
  'ESTONIA',
  'FINLAND',
  'FRANCE',
  'GERMANY',
  'GREECE',
  'HUNGARY',
  'IRELAND',
  'ITALY',
  'LATVIA',
  'LITHUANIA',
  'LUXEMBOURG',
  'MALTA',
  'NETHERLANDS',
  'POLAND',
  'PORTUGAL',
  'ROMANIA',
  'SLOVAKIA',
  'SLOVENIA',
  'SPAIN',
  'SWEDEN',
  'EUROPEAN UNION',
  'ICELAND',
  'NORWAY',
  'SWITZERLAND',
  'EFTA',
  'UNITED KINGDOM',
  'EU + EFTA + UK',
];

interface Registration {
  year: number;
  month: number;
  region: string;
  power_train: string;
  value: number;
}

export class ACEAByMarketAndPSAccumulator extends BaseAccumulator<any> {
  constructor() {
    super('acea-by-market-and-ps', 'https://www.acea.auto/');
  }

  private async convertToArray(filePath: string): Promise<string[]> {
    // Verifico si el archivo no existe
    // Pq si ese es el caso debe haber un json con la información
    // como respaldo
    if (!fs.existsSync(filePath)) {
      const jsonPath = filePath.replace('.png', '.json');
      if (!fs.existsSync(jsonPath)) {
        throw new Error(
          `No se encontró el archivo ${filePath} ni el archivo ${jsonPath}`
        );
      }

      return JSON.parse(fs.readFileSync(jsonPath).toString());
    }

    // Cargo la imagen y la convierto a base 64
    const image = fs.readFileSync(filePath);
    const base64Image = image.toString('base64');

    // Defino el esquema de salida
    const outputSchema = z.object({
      data: z
        .array(z.string())
        .describe('Arreglo de los campos de la columna de la tabla.'),
    });

    // Extraigo la información de la imagen
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `
              La siguiente imagen es una columna de una tabla donde cada fila es un campo diferente. 
              
              Se debe extraer cada valor tal cual como aparece. 
              
              No se debe ignorar ningún campo. Deben haber 34 campos, asegúrate de que sea esa cantidad. Verifica dos veces que los valores sean idénticos a los de la imagen.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(outputSchema, 'data'),
    });

    return JSON.parse(response.choices[0].message.content).data;
  }

  private parseNumber(value: string): number | undefined {
    // Limpio el value
    // Elimino los espacios al inicio y al final
    // Elimino las comas y los puntos
    let v = value.trim();
    v = v.replace(/,/g, '');
    v = v.replace(/\./g, '');
    v = v.replace(/\-/g, '');

    if (v === '') {
      return undefined;
    }

    return parseInt(v);
  }

  protected async transform(dataPath: string): Promise<any[]> {
    // Extraigo el año y la fecha del archivo
    const parts = path.basename(dataPath).split('_');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);

    const regions = REGIONS;
    const [bev, phev, hev, others, petrol, diesel, total] = await Promise.all([
      this.convertToArray(path.join(dataPath, 'bev.png')),
      this.convertToArray(path.join(dataPath, 'phev.png')),
      this.convertToArray(path.join(dataPath, 'hev.png')),
      this.convertToArray(path.join(dataPath, 'others.png')),
      this.convertToArray(path.join(dataPath, 'petrol.png')),
      this.convertToArray(path.join(dataPath, 'diesel.png')),
      this.convertToArray(path.join(dataPath, 'total.png')),
    ]);

    // Valido que todos los arreglos tengan la misma longitud
    const index = {
      bev,
      phev,
      hev,
      others,
      petrol,
      diesel,
      total,
    };
    for (const key in index) {
      if (index[key].length !== regions.length) {
        console.debug({
          key,
          length: index[key].length,
          expected_length: regions.length,
          data: JSON.stringify(index[key]),
        });
        throw new Error(`La data de ${key} no tiene la longitud correcta.`);
      }
    }

    const registrations: Registration[] = [];
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];

      registrations.push({
        year,
        month,
        region,
        power_train: 'BEV',
        value: this.parseNumber(bev[i]),
      });

      registrations.push({
        year,
        month,
        region,
        power_train: 'PHEV',
        value: this.parseNumber(phev[i]),
      });

      registrations.push({
        year,
        month,
        region,
        power_train: 'HEV',
        value: this.parseNumber(hev[i]),
      });

      registrations.push({
        year,
        month,
        region,
        power_train: 'OTHERS',
        value: this.parseNumber(others[i]),
      });

      registrations.push({
        year,
        month,
        region,
        power_train: 'PETROL',
        value: this.parseNumber(petrol[i]),
      });

      registrations.push({
        year,
        month,
        region,
        power_train: 'DIESEL',
        value: this.parseNumber(diesel[i]),
      });

      registrations.push({
        year,
        month,
        region,
        power_train: 'TOTAL',
        value: this.parseNumber(total[i]),
      });
    }

    return registrations;
  }
}
