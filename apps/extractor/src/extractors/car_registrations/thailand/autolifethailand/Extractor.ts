import axios from 'axios';
import * as cheerio from 'cheerio';
import lodash from 'lodash';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import sharp from 'sharp';
import Tesseract, { createWorker } from 'tesseract.js';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://autolifethailand.tv/tag/sales-report/';

interface Rectangle {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'thailand'],
      source: 'autolifethailand',
      fileext: 'jpg',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Descargo la página principal donde estan los artículos
    let response = await axios.get(SOURCE_URL);
    let $ = cheerio.load(response.data);

    // Obtengo los links de los artículos
    const links = Array.from($('.tdi_93 .td-module-title a'));
    if (links.length === 0) {
      throw new Error('No links found');
    }

    // Extraigo los títulos y urls de los artículos
    const articles: { title: string; url: string }[] = [];
    for (const link of links) {
      const text = $(link).text();
      const href = $(link).attr('href');
      articles.push({ title: text, url: href });
    }

    // Los textos de los cards son muy dificil de identificar
    // se nota que los hace alguien a mano, por eso uso OpenAI
    // para que un modelo de ia razone de forma rápida y tome
    // la decisión. Es simple para un modelo de ia pq la info está clara
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const completion = await openai.beta.chat.completions.parse({
      model: 'gpt-4o-mini-2024-07-18',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `
              Dado un arreglo de textos extraídos de las tarjetas de un sitio web, identifica la posición (índice) del texto que haga referencia explícita al informe de matriculaciones totales de vehículos eléctricos en Tailandia para el año ${year} y el mes ${month}. Los meses parten del 1. 

              Si no se encuentra un texto que cumpla explícitamente con la descripción, devuelve un JSON con "position": -1 

              Respuesta:
              Devuelve un JSON con el formato:
              {
                "position": número
              }`,
        },
        {
          role: 'user',
          content: `Texts: [
                  ${articles.map((a) => `"${a.title}"`).join(', ')}
                ]`,
        },
      ],
      response_format: zodResponseFormat(
        z.object({
          position: z.number().int(),
        }),
        'response_position'
      ),
    });
    const { position } = completion.choices[0].message.parsed;

    // Si no se encuentra la posición
    // informo que no hay datos
    if (position === -1) {
      return null;
    }

    // Descargo el artículo
    const article = articles[position];
    response = await axios.get(article.url);
    $ = cheerio.load(response.data);

    // Encuentro la url de la imagen
    const downloadUrl = $('.td-post-content img.size-full').attr('src');
    if (!downloadUrl) {
      console.debug({
        article_url: article.url,
      });
      throw new Error('Image not found');
    }

    // Descargo la imagen
    const fileContent = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;

    // Cargar la imagen en escala de grises
    const image = sharp(fileData.path).greyscale();
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Binzarizar la imagen
    const threshold = 210;
    const binarizedData = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      binarizedData[i] = data[i] >= threshold ? 255 : 0; // Binarizar el píxel
    }

    // Extraigo los espacios horizontales
    let horizontalSpaces: Rectangle[] = (() => {
      let inSpace = false;
      let currentSpace: Rectangle = null;
      const horizontalSpaces: Rectangle[] = [];
      for (let y = 0; y < info.height; y++) {
        let whiteCount = 0;

        // Contar píxeles blancos en la línea
        for (let x = 0; x < info.width; x++) {
          const index = y * info.width + x;
          if (binarizedData[index] === 255) {
            whiteCount++;
          }
        }

        // Determinar si la línea es un "espacio"
        if (whiteCount / info.width >= 0.95) {
          if (!inSpace) {
            inSpace = true;
            currentSpace = {
              startX: 0,
              endX: info.width - 1,
              startY: y,
              endY: y,
            };
            horizontalSpaces.push(currentSpace);
          }
          currentSpace.endY = y;
        } else {
          inSpace = false;
        }
      }
      return horizontalSpaces;
    })();
    // Filtrar espacios muy pequeños
    horizontalSpaces = horizontalSpaces.filter((hS) => hS.endY - hS.startY > 5);

    // Creo los rectángulos de las filas
    const rowsRectangles: Rectangle[] = [];
    let beforeSpace = horizontalSpaces[0];
    for (let i = 1; i < horizontalSpaces.length; i++) {
      const space = horizontalSpaces[i];

      rowsRectangles.push({
        startX: 0,
        endX: info.width - 1,
        startY: beforeSpace.endY - (beforeSpace.endY - beforeSpace.startY) / 2,
        endY: space.endY - (space.endY - space.startY) / 2,
      });
      beforeSpace = space;
    }

    // Extraigo los textos en los rectángulos
    // estos no son los textos finales ya que teseract
    // se equivoca mucho, pero me sirven para saber
    // donde están los textos (coordenadas)
    let rowsData: { words: Tesseract.Word[]; rectangle: Rectangle }[] = [];
    const rowsRectanglesChunks = lodash.chunk(rowsRectangles, 10);
    for (const chunk of rowsRectanglesChunks) {
      let promises: Promise<{
        words: Tesseract.Word[];
        rectangle: Rectangle;
      }>[] = [];
      for (const rectangle of chunk) {
        promises.push(
          (async () => {
            const worker = await createWorker('eng');
            const { data } = await worker.recognize(fileData.data, {
              rectangle: {
                left: Math.round(rectangle.startX),
                top: Math.round(rectangle.startY),
                width: Math.round(rectangle.endX - rectangle.startX),
                height: Math.round(rectangle.endY - rectangle.startY),
              },
            });
            await worker.terminate();
            const words = data.words
              // Filtro los | que los infiere como palabras
              .filter((w) => w.text !== '|');
            return {
              words,
              rectangle,
            };
          })()
        );
      }
      const result = await Promise.all(promises);
      rowsData.push(...result);
    }

    // Me quedo solo con los rows data que los textos incluyen tesla
    rowsData = rowsData.filter(({ words }) =>
      words.some((word) => word.text.toLowerCase().includes('tesla'))
    );

    // Uso los rows words para encontrar los rectangulo de cada celda
    // dentro de cada fila. Con esos rectangulos segmento la imagen y
    // y la envio a openai para que me diga el modelo y las matriculaciones.
    // Al final valido la data con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        model: z.preprocess((val: string) => {
          return val
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');
        }, z.string()),
        registrations: z.number().int(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const MARGIN = 5;
    const registrations: Registrations[] = [];
    const rowsDataChunks = lodash.chunk(rowsData, 10);
    for (let i = 0; i < rowsDataChunks.length; i++) {
      const rowsData = rowsDataChunks[i];
      let promises: Promise<void>[] = [];
      for (const { words, rectangle } of rowsData) {
        promises.push(
          (async () => {
            let totalMonths = month;
            if (year === 2023) {
              totalMonths = 12;
            } else if (year === 2024 && month <= 10) {
              totalMonths = 10;
            }

            const modelWords = words.slice(1, words.length - (totalMonths + 2));
            const others = words.slice(-1 * (totalMonths + 2));

            const [modelText, registrationsValue] = await Promise.all([
              (async () => {
                // Determinar el rectángulo del modelo
                let modelRectangle: Rectangle = {
                  startX: modelWords[0].bbox.x0,
                  endX: modelWords[0].bbox.x1,
                  startY: modelWords[0].bbox.y0,
                  endY: modelWords[0].bbox.y1,
                };
                for (let i = 1; i < modelWords.length; i++) {
                  const word = modelWords[i];
                  modelRectangle.endX = word.bbox.x1;
                }
                modelRectangle = {
                  startX: Math.max(0, modelRectangle.startX - MARGIN),
                  endX: Math.min(info.width - 1, modelRectangle.endX + MARGIN),
                  startY: Math.max(
                    rectangle.startY,
                    modelRectangle.startY - MARGIN
                  ),
                  endY: Math.min(rectangle.endY, modelRectangle.endY + MARGIN),
                };

                // Creo una imagen con solo el modelo
                const imageBuffer = await sharp(fileData.data)
                  .extract({
                    left: Math.floor(modelRectangle.startX),
                    top: Math.floor(modelRectangle.startY),
                    width: Math.ceil(
                      modelRectangle.endX - modelRectangle.startX + 1
                    ),
                    height: Math.ceil(
                      modelRectangle.endY - modelRectangle.startY + 1
                    ),
                  })
                  .toBuffer();

                // Extraer texto de la imagen usando Tesseract.js
                const worker = await createWorker('eng');
                const {
                  data: { text: extractedText },
                } = await worker.recognize(imageBuffer);
                await worker.terminate();

                // Mejoro el texto extraído con OpenAI
                const completion = await openai.beta.chat.completions.parse({
                  model: 'gpt-4o-mini-2024-07-18',
                  temperature: 0,
                  messages: [
                    {
                      role: 'system',
                      content: `
                        Necesito extraer el modelo de auto eléctrico a partir del siguiente texto.
                        Devuelve un JSON con el formato:
                        {
                          "model": "Tesla Model 3"
                        }`,
                    },
                    {
                      role: 'user',
                      content: extractedText,
                    },
                  ],
                  response_format: zodResponseFormat(
                    z.object({
                      model: z.string(),
                    }),
                    'response_model'
                  ),
                });
                const { model } = completion.choices[0].message.parsed;
                return model;
              })(),
              (async () => {
                // Determinar el rectángulo de las matriculaciones
                const registrationsRectangle: Rectangle = {
                  startX: Math.max(0, others[month - 1].bbox.x0 - MARGIN),
                  endX: Math.min(
                    info.width - 1,
                    others[month - 1].bbox.x1 + MARGIN
                  ),
                  startY: Math.max(
                    rectangle.startY,
                    others[month - 1].bbox.y0 - MARGIN
                  ),
                  endY: Math.min(
                    rectangle.endY,
                    others[month - 1].bbox.y1 + MARGIN
                  ),
                };

                // Creo una imagen con solo las matriculaciones
                const imageBuffer = await sharp(fileData.data)
                  .extract({
                    left: Math.floor(registrationsRectangle.startX),
                    top: Math.floor(registrationsRectangle.startY),
                    width: Math.ceil(
                      registrationsRectangle.endX -
                        registrationsRectangle.startX +
                        1
                    ),
                    height: Math.ceil(
                      registrationsRectangle.endY -
                        registrationsRectangle.startY +
                        1
                    ),
                  })
                  .toBuffer();

                // Extraigo el texto de las matriculaciones
                const imageBase64 = imageBuffer.toString('base64');
                const completion = await openai.beta.chat.completions.parse({
                  model: 'gpt-4o-2024-08-06',
                  temperature: 0,
                  messages: [
                    {
                      role: 'system',
                      content: `
                        Extrae el número de la imagen. El número puede tener comas como separadores.
                        Responde en formato JSON:
                        {
                          "value": 211
                        }`,
                    },
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'text',
                          text: 'Aquí está la imagen:',
                        },
                        {
                          type: 'image_url',
                          image_url: {
                            url: 'data:image/jpeg;base64,' + imageBase64,
                          },
                        },
                      ],
                    },
                  ],
                  response_format: zodResponseFormat(
                    z.object({
                      value: z.number().int(),
                    }),
                    'response_value'
                  ),
                });
                const { value } = completion.choices[0].message.parsed;
                return value;
              })(),
            ]);

            const parsed = Schema.parse({
              year,
              month,
              model: modelText,
              registrations: registrationsValue,
            });

            registrations.push(parsed);
          })()
        );
      }
      await Promise.all(promises);
    }

    return [
      {
        name: 'registrations_by_model',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
