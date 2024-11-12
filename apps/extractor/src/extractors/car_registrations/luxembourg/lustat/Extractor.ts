import axios from 'axios';
import z from 'zod';
import {
  FileData,
  FileOuput,
  MonthDateId,
  MonthExtractor,
} from '../../../../lib';

const SOURCE_URL = `https://lustat.statec.lu/rest/data/LU1,DF_D6124,1.1/.M.._T+CAR..VOLKSWAGEN+BMW+MERCEDES+AUDI+PEUGEOT+SKODA+MINI+RENAULT+TESLA+VOLVO+PORSCHE+SEAT+HYUNDAI+DACIA+KIA+TOYOTA+CITROEN+CUPRA+DS+FIAT+LANDSPACEROVER+OPEL+POLESTAR+NISSAN+FORD+FORDSPACEOPENBDCLOSEB+MAZDA+SUZUKI+MASERATI+ALFASPACEROMEO+JAGUAR.......?startPeriod=2018-01&endPeriod={YEAR}-{MONTH}&lastNObservations=1&dimensionAtObservation=AllDimensions`;

class Extractor extends MonthExtractor {
  constructor() {
    super({
      folders: ['car_registrations', 'countries', 'luxembourg'],
      source: 'lustat',
      fileext: 'json',
    });
  }

  async download(dateId: MonthDateId): Promise<Buffer | null> {
    const { year, month } = dateId;

    // Reemplazo los placeholders de la URL
    let sourceUrl = SOURCE_URL.replace('{YEAR}', year.toString());
    sourceUrl = sourceUrl.replace('{MONTH}', month.toString().padStart(2, '0'));

    // Obtengo el XML con los datos
    const { data } = await axios.get(sourceUrl);

    // Identifico si los datos están disponibles
    const timePeriodDimension = data.structure.dimensions.observation.find(
      (dim) => dim.id === 'TIME_PERIOD'
    );
    const expectedDateId = `${year}-${month.toString().padStart(2, '0')}`;
    if (
      !timePeriodDimension.values.some((value) => value.id === expectedDateId)
    ) {
      // Informo que los datos aún no están publicados
      return null;
    }

    // Extraigo los datos de la respuesta
    const brandDimension = data.structure.dimensions.observation.find(
      (dim) => dim.id === 'BRAND'
    );
    const vehicleTypeDimension = data.structure.dimensions.observation.find(
      (dim) => dim.id === 'VEHICLE_TYPE'
    );
    const brandsMap = Object.fromEntries(
      brandDimension.values.map((value, index) => [index, value.name])
    );
    const vehicleTypesMap = Object.fromEntries(
      vehicleTypeDimension.values.map((value, index) => [index, value.name])
    );
    const registrations = Object.entries(data.dataSets[0].observations)
      .map(([key, value]) => {
        const indices = key.split(':').map(Number);
        const vehicleTypeIndex = indices[3];
        const brandIndex = indices[5];

        if (vehicleTypesMap[vehicleTypeIndex] === 'Cars') {
          return {
            brand: brandsMap[brandIndex],
            registrations: value[0],
          };
        }
        return null;
      })
      .filter((item) => item !== null);

    // Ordeno por nombre de marca, para poder comparar fácilmente
    registrations.sort((a, b) => a.brand.localeCompare(b.brand));

    return Buffer.from(JSON.stringify(registrations, null, 2));
  }

  async transform(
    dateId: MonthDateId,
    fileData: FileData
  ): Promise<FileOuput[]> {
    const data = JSON.parse(fileData.data.toString());

    // Valido la data
    const Schema = z
      .object({
        year: z.number().int(),
        month: z.number().int(),
        brand: z.preprocess(
          (val: string) => val.trim().toUpperCase().replace(/\s+/g, '_'),
          z.string()
        ),
        registrations: z.number().int(),
      })
      .strict();
    type Registrations = z.infer<typeof Schema>;

    const registrations: Registrations[] = [];
    for (const item of data) {
      const parsed = Schema.parse({
        year: dateId.year,
        month: dateId.month,
        brand: item.brand,
        registrations: item.registrations,
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
