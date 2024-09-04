import fs from 'fs';
import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { BaseAccumulator } from '../lib/BaseAccumulator';

const openai = new OpenAI();

const outputSchema = z.object({
  deliveries: z
    .array(
      z.object({
        year: z.number().describe('Año de las entregas'),
        month: z.number().describe('Mes de las entregas'),
        value: z.number().describe('Total de las entregas'),
      })
    )
    .describe('Deliveries de autos Xpeng'),
});

interface Delivery {
  year: number;
  month: number;
  value: number;
}

export class CNEVXpengDeliveriesAccumulator extends BaseAccumulator<Delivery> {
  constructor() {
    super('cnev-xpeng-deliveries', 'https://cnevdata.com/');
  }

  protected async transform(filePath: string): Promise<Delivery[]> {
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
              text: 'De la siguiente imagen que muestra una tabla con deliveries de autos de la empresa Xpeng. Extrae los deliveries, donde cada uno tiene la información del año, mes y el total de deliveries.',
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
      response_format: zodResponseFormat(outputSchema, 'deliveries'),
    });

    const parsed: { deliveries: Delivery[] } = JSON.parse(
      response.choices[0].message.content
    );

    return parsed.deliveries.sort((a, b) => {
      if (a.year === b.year) {
        return a.month - b.month;
      }
      return a.year - b.year;
    });
  }
}
