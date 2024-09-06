import fs from 'fs';
import path from 'path';
import { BaseAccumulator } from '../lib/BaseAccumulator';
import {
  AnalyzeDocumentCommand,
  Block,
  TextractClient,
} from '@aws-sdk/client-textract';
import os from 'os';
import { execSync } from 'child_process';
import { z } from 'zod';

const REGISTRATIONS_BY_MANUFACTURER_EU_ID = 'registrations_by_manufacturer_eu';

export class ACEAAcumulator extends BaseAccumulator {
  private textractClient: TextractClient;

  constructor() {
    super('acea');
    this.textractClient = new TextractClient({
      region: 'us-east-1',
    });
  }

  protected transform(id: string, version: string): Promise<Object[]> {
    switch (id) {
      case REGISTRATIONS_BY_MANUFACTURER_EU_ID:
        return this.transformRegistrationsByManufacturerEU(version);
      default:
        throw new Error(`Unknown id: ${id}`);
    }
  }

  private async transformRegistrationsByManufacturerEU(
    version: string
  ): Promise<Object[]> {
    // Extraigo el año y el mes de la versión
    const parts = version.split('.')[0].split('_');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);

    // Cargo la imagen
    const imagePath = path.join(
      this.downloadPath,
      REGISTRATIONS_BY_MANUFACTURER_EU_ID,
      version
    );
    const imageContent = await fs.promises.readFile(imagePath);

    // La envio a AWS Textract
    const command = new AnalyzeDocumentCommand({
      Document: { Bytes: imageContent },
      FeatureTypes: ['TABLES'],
    });
    const response = await this.textractClient.send(command);

    // Convierto la respuesta en un objeto
    const getText = (cell: Block): string => {
      // Hago un reduce para concatenar el texto de cada relación
      return cell.Relationships[0].Ids.reduce((acc, id) => {
        const block = response.Blocks.find((block) => block.Id === id);
        if (acc.length > 0) {
          return acc + ' ' + block.Text;
        }
        return acc + block.Text;
      }, '');
    };
    const cells = response.Blocks.filter((block) => block.BlockType === 'CELL');

    const registrationsList = [];
    let manufacturer: string | undefined;
    let total_registered: number | undefined;
    let market_percent_total: number | undefined;
    for (const cell of cells) {
      if (cell.ColumnIndex === 1) {
        manufacturer = getText(cell).toUpperCase();
        // console.log('Manufacturer', manufacturer);
      }

      if (cell.ColumnIndex === 2) {
        market_percent_total = parseFloat(getText(cell));
        // console.log('Market Percent Total', market_percent_total);
      }

      if (cell.ColumnIndex === 4) {
        total_registered = parseInt(getText(cell).replace(/,/g, ''));
        // console.log('Total Registered', total_registered);
      }

      if (
        manufacturer !== undefined &&
        total_registered !== undefined &&
        market_percent_total !== undefined
      ) {
        registrationsList.push({
          year,
          month,
          manufacturer,
          market_percent_total,
          total_registered,
        });
        manufacturer = undefined;
        total_registered = undefined;
        market_percent_total = undefined;
      }
    }

    // Transformo y valido los registrations
    const manufacturerEnum = z.enum([
      'VOLKSWAGEN_GROUP',
      'VOLKSWAGEN',
      'SKODA',
      'AUDI',
      'SEAT',
      'CUPRA',
      'PORSCHE',
      'STELLANTIS',
      'PEUGEOT',
      'FIAT',
      'CITROEN',
      'OPEL_VAUXHALL',
      'JEEP',
      'DS',
      'LANCIA_CHRYSLER',
      'ALFA_ROMEO',
      'RENAULT_GROUP',
      'DACIA',
      'RENAULT',
      'ALPINE',
      'HYUNDAI_GROUP',
      'KIA',
      'HYUNDAI',
      'TOYOTA_GROUP',
      'TOYOTA',
      'LEXUS',
      'BMW_GROUP',
      'BMW',
      'MINI',
      'MERCEDES_BENZ',
      'MERCEDES',
      'SMART',
      'FORD',
      'VOLVO_CARS',
      'NISSAN',
      'MAZDA',
      'SUZUKI',
      'JAGUAR_LAND_ROVER_GROUP',
      'LAND_ROVER',
      'JAGUAR',
      'TESLA',
      'MITSUBISHI',
      'HONDA',
      'OPEL',
      'SAIC_MOTOR',
    ]);
    const dataSchema = z.array(
      z.object({
        year: z.number().int(),
        month: z.number().int(),
        manufacturer: z
          .string()
          .transform((val) => {
            // Transformación clara: Reemplaza y limpia
            const transformed = val
              .replace(/[\s\-\/]/g, '_') // Reemplaza espacios, guiones y barras por guión bajo
              .replace('FIAT³', 'FIAT') // Remueve el superíndice "³"
              .replace('FIAT3', 'FIAT') // Remueve el superíndice "³"
              .trim() // Remueve espacios adicionales
              .toUpperCase(); // Convierte todo a mayúsculas
            return transformed;
          })
          .refine(
            (val) => {
              const isValid = manufacturerEnum.safeParse(val).success;
              return isValid;
            },
            {
              message: 'Invalid manufacturer',
            }
          ),
        market_percent_total: z.number(),
        total_registered: z.number().int(),
      })
    );

    // Elimino los registrations donde el manufacturer empieza con others
    // Others no son tan relevantes para el análisis
    const filteredRegistrations = registrationsList.filter(
      (registration) =>
        !registration.manufacturer.toUpperCase().startsWith('OTHERS')
    );

    try {
      const parsed = dataSchema.parse(filteredRegistrations);
      return parsed;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Muestro un detalle para corregir el error más facil
        error.errors.forEach((issue) => {
          const index = issue.path[0];
          console.error(
            `Error en el índice ${index} del arreglo:`,
            filteredRegistrations[index]
          );
          console.error(`Detalles del error: ${issue.message}`);
        });
      }

      throw error;
    }

    // // DEBUG CODE

    // // Mostrar el reponse en vscode
    // const tmpFilePath = path.join(os.tmpdir(), `${new Date().valueOf()}.json`);
    // await fs.promises.writeFile(
    //   tmpFilePath,
    //   JSON.stringify(response.Blocks, null, 2)
    // );
    // execSync(`code ${tmpFilePath}`);

    // return registrationsList;
  }
}
