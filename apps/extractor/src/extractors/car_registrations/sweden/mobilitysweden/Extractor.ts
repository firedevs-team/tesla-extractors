import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx, { CellObject } from 'xlsx';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL =
  'https://mobilitysweden.se/statistik/Nyregistreringar_per_manad_1';

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'sweden'],
      source: 'mobilitysweden',
      fileext: 'xlsx',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    const { data: mainPage } = await axios.get(SOURCE_URL);
    const $page = cheerio.load(mainPage);

    // Encuentro los links y fechas de las noticias
    const MONTH_NAME_MAP = {
      januari: 0,
      februari: 1,
      mars: 2,
      april: 3,
      maj: 4,
      juni: 5,
      juli: 6,
      augusti: 7,
      september: 8,
      oktober: 9,
      november: 10,
      december: 11,
    };
    const news = Array.from($page('.news-list__item')).map((item) => {
      const dateText = $page(item).find('.list_date').text();
      const parts = dateText.split(' ');
      const publishDate = new Date(
        parseInt(parts[2]),
        MONTH_NAME_MAP[parts[1]],
        parseInt(parts[0])
      );
      return {
        date: publishDate,
        link: $page(item).find('.list_readmore a').attr('href'),
      };
    });

    // Me quedo con las noticias que la fecha
    // de publicación sea mayor o igual a la esperada
    // La fecha de publicación esperada es
    // el primer día del mes que viene
    // month es 0-indexed por lo que no hay q sumarle 1
    const expectedPublicationDate = new Date(year, month, 1);
    const filteredNews = news.filter(
      (item) => item.date >= expectedPublicationDate
    );
    // Si no hay noticias, es que no se ha publicado aún
    if (filteredNews.length === 0) {
      return null;
    }

    // Me quedo con la ultima noticia
    // que sería la primera del mes
    const newsPageLink = filteredNews[filteredNews.length - 1].link;

    // Descargo la página de la noticia
    const response = await axios.get(newsPageLink);
    const $ = cheerio.load(response.data);

    let downloadLink: string = null;
    const MONTH_MAP = {
      1: 'januari',
      2: 'februari',
      3: 'mars',
      4: 'april',
      5: 'maj',
      6: 'juni',
      7: 'juli',
      8: 'augusti',
      9: 'september',
      10: 'oktober',
      11: 'november',
      12: 'december',
    };
    const posibleFileNames = [
      `Månadsrapport Nyregistreringar ${MONTH_MAP[month]} ${year}.xlsx`,
      `Nyregistreringar ${MONTH_MAP[month]} ${year}.xlsx`,
      `Nyregistreringar ${MONTH_MAP[month]}_${year}.xlsx`,
    ].map((name) => name.normalize().toUpperCase());
    const links = Array.from($('.filelist_type_listing_row_filename a'));
    for (const link of links) {
      const text = $(link).text().trim().normalize().toUpperCase();
      if (posibleFileNames.includes(text)) {
        downloadLink = `https://mobilitysweden.se${$(link).attr('href')}`;
        break;
      }
    }

    // Si no se encontró el link
    // lanzo un error pq eso no debería pasar
    if (!downloadLink) {
      throw new Error('Download link not found');
    }

    const fileContent = await axios(downloadLink, {
      responseType: 'arraybuffer',
    });

    return fileContent.data;
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const workbook = xlsx.read(fileData.data, { type: 'buffer' });

    // Me quedo con la página numero 4
    const sheetName = workbook.SheetNames[3];

    const sheet = workbook.Sheets[sheetName];
    let cells: { key: string; data: CellObject }[] = Object.keys(sheet).map(
      (key) => ({ key, data: sheet[key] })
    );

    const raw: {
      brand: string;
      model: string;
      registrations: number;
      market_share: number;
    }[] = [];
    // De marzo de 2024 en adelante el excel
    // tiene una estructura diferente
    const isAfterMarch2024 = year > 2024 || (year === 2024 && month >= 3);
    if (isAfterMarch2024) {
      // Me con el contenido de la tabla
      const startPos = cells.findIndex((cell) => cell.data.w === 'YTDLY');
      const endPos = cells.findIndex((cell) => cell.data.w === 'Totalt');
      cells = cells.slice(startPos + 1, endPos - 1);

      // Extraigo la información de la tabla
      let currentBrand: string;
      for (const cell of cells) {
        let value = cell.data.v;
        // Si es un string y no es un guión
        // Es una marca o un modelo
        if (typeof value === 'string' && value !== '-') {
          // Hay un modelo q es "Total" este lo ignoro
          if (value === 'Total') {
            continue;
          }

          // Si el key empieza con la letra "D"
          // es una marca y si no es un modelo
          if (cell.key.startsWith('D')) {
            currentBrand = value;
          } else {
            const model = value;
            const rowIndex = cell.key.replace(/[A-Z]/g, '');

            const registrationsCell = cells.find(
              (cell) => cell.key === `J${rowIndex}`
            );
            // Hay casos donde no hay registros
            // estos casos los ignoro
            if (registrationsCell) {
              const registrations = registrationsCell.data.v;
              const marketShare = cells.find(
                (cell) => cell.key === `Q${rowIndex}`
              ).data.v;

              raw.push({
                brand: currentBrand,
                model,
                registrations: registrations as number,
                market_share: marketShare as number,
              });
            }
          }
        }
      }
    } else {
      // Me con el contenido de la tabla
      const startPos = cells.findIndex((cell) => cell.data.w?.startsWith('1('));
      const endPos = cells.findIndex((cell) => cell.data.w === 'Totalmarknad');
      cells = cells.slice(startPos, endPos);

      // Extraigo la información de la tabla
      let currentBrand: string = null;
      let currentBrandTotal = 0;
      for (const cell of cells) {
        let value = cell.data.v;
        const rowIndex = cell.key.replace(/[A-Z]/g, '');
        // Si está en la columna B
        // entonces es una marca o un modelo
        if (cell.key.startsWith('B')) {
          // Lo primero que me topo es una marca
          // ahi obtengo la marca y el total de la marca
          // para cambiar de marca lo hago cuando descuento
          // el total de los modelos y llego a 0
          if (currentBrandTotal <= 0) {
            const total = cells.find((c) => c.key === `E${rowIndex}`).data
              .v as number;

            // Hay un caso en que se llega a 0
            // y todavía quedan modelos pero con valor 0
            // en ese caso no cambio de marca
            if (total === 0) {
              continue;
            }

            // Actualizo la marca y el total
            currentBrand = value + '';
            currentBrandTotal = total;
          } else {
            const model = value + '';
            const registrations = cells.find((c) => c.key === `E${rowIndex}`)
              .data.v as number;
            const market_share = cells.find((c) => c.key === `H${rowIndex}`)
              .data.v as number;

            // Si es 0 lo ignoro
            if (registrations === 0) {
              continue;
            }

            raw.push({
              brand: currentBrand,
              model,
              registrations,
              market_share,
            });

            // Descuento el total de la marca
            currentBrandTotal = currentBrandTotal - registrations;
          }
        }
      }
    }

    // Valido con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        model: z.string().trim().toUpperCase(),
        registrations: z.number().int(),
        market_share: z.number().transform((val) => {
          // En la estructura moderna hay que multiplicar
          // el market share por 100
          if (isAfterMarch2024) {
            return val * 100;
          }

          return val;
        }),
      })
      .strict();

    type IRegistrations = z.infer<typeof Schema>;
    const registrations: IRegistrations[] = [];
    for (const item of raw) {
      const parsed = Schema.parse({
        year,
        month,
        ...item,
      });
      registrations.push(parsed);
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
