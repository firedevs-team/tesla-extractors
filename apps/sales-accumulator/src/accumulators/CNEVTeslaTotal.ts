import fs from 'fs';
import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { BaseAccumulator } from '../lib/BaseAccumulator';

const openai = new OpenAI();

const outputSchema = z.object({
  sales: z
    .array(
      z.object({
        year: z.number().describe('Año de la venta'),
        month: z.number().describe('Mes de la venta'),
        value: z.number().describe('Valor de la venta'),
      })
    )
    .describe('Ventas de autos de Tesla en China'),
});

interface Sale {
  year: number;
  month: number;
  value: number;
}

export class CNEVTeslaTotalAccumulator extends BaseAccumulator<Sale> {
  constructor() {
    super('cnev-tesla-total', 'https://cnevdata.com/');
  }

  protected async transform(filePath: string): Promise<Sale[]> {
    // Cargo imagen y la convierto a base 64
    const image = fs.readFileSync(filePath);
    const base64Image = image.toString('base64');

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
              text: 'De la siguiente imagen que muestra una tabla con ventas de autos de Tesla en China. Extrae las ventas, donde cada una tiene la información del año, mes y el valor de las ventas.',
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
      response_format: zodResponseFormat(outputSchema, 'sales'),
    });

    const parsed: { sales: Sale[] } = JSON.parse(
      response.choices[0].message.content
    );

    return parsed.sales.sort((a, b) => {
      if (a.year === b.year) {
        return a.month - b.month;
      }
      return a.year - b.year;
    });
  }
}
