import axios from 'axios';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = 'https://motordata.pt/autoinforma/chartdata_novo.php';

interface IData {
  lastyear: string[];
  thisyear: string[];
  result_table: {
    Marca: string;
    Mensal: string;
    Acumulado: string;
    varAcumulado: string;
    varMensal: string;
  }[];
}

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'portugal'],
      source: 'autoinforma',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;
    const { data } = await axios.post<IData>(
      SOURCE_URL,
      // catvehiculo ,0 es "Vehículos ligeros de pasajeros"
      'list_combustivel=&list_catveiculo=%2C0',
      {
        headers: {
          accept: '*/*',
          'accept-language': 'es-ES,es;q=0.9',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          origin: 'https://motordata.pt',
          priority: 'u=1, i',
          referer: 'https://motordata.pt/autoinforma/charts1t.php',
          'sec-ch-ua':
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
          'x-requested-with': 'XMLHttpRequest',
        },
      }
    );

    // Valido que la data es de la fecha esperada
    // El endpoint siempre siempre devuelve data del mes
    // anterior por eso hay que validar que sea la correcta
    const dataYear = (() => {
      const tmpDate = new Date();
      tmpDate.setMonth(tmpDate.getMonth() - 1);
      return tmpDate.getFullYear();
    })();
    const dataMonth = data.thisyear.length;
    if (year !== dataYear || month !== dataMonth) {
      // Si es la data informo que no está disponible aún
      return null;
    }

    return Buffer.from(JSON.stringify(data, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const { year, month } = dateId;
    const data: IData = JSON.parse(fileData.data.toString());

    // Valido los datos con zod
    const Schema = z
      .object({
        year: z.number(),
        month: z.number(),
        brand: z.string().trim().toUpperCase(),
        registrations: z.coerce.number().int(),
      })
      .strict();

    const registrations: object[] = [];
    for (const row of data.result_table) {
      const parsed = Schema.parse({
        year,
        month,
        brand: row.Marca,
        registrations: row.Mensal,
      });
      registrations.push(parsed);
    }

    return [
      {
        name: 'registrations_by_brand',
        data: registrations,
      },
    ];
  }

  async debug() {}
}

export default new Extractor();
