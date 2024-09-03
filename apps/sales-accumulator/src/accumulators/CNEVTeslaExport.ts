import fs from 'fs';
import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { BaseAccumulator } from '../lib/BaseAccumulator';

const openai = new OpenAI();

const outputSchema = z.object({
  exports: z
    .array(
      z.object({
        year: z.number().describe('Año de la exportación'),
        month: z.number().describe('Mes de la exportación'),
        value: z.number().describe('Total de exportaciones'),
      })
    )
    .describe('Exportaciones de autos Tesla en China'),
});

interface Export {
  year: number;
  month: number;
  value: number;
}

export class CNEVTeslaExportAccumulator extends BaseAccumulator<Export> {
  constructor() {
    super('cnev-tesla-export', 'https://cnevdata.com/');
  }

  protected async transform(filePath: string): Promise<Export[]> {
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
              text: 'De la siguiente imagen que muestra una tabla con exportaciones de autos Tesla en China. Extrae las exportaciones, donde cada una tiene la información del año, mes y la cantidad exportada.',
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
      response_format: zodResponseFormat(outputSchema, 'exports'),
    });

    const parsed: { exports: Export[] } = JSON.parse(
      response.choices[0].message.content
    );

    return parsed.exports.sort((a, b) => {
      if (a.year === b.year) {
        return a.month - b.month;
      }
      return a.year - b.year;
    });
  }
}
