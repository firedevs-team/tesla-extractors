import Papa from 'papaparse';
import { BaseTransformer } from '../../../lib';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { Parser } from 'json2csv';

const COUNTRIES_PATH = path.join('car_registrations', 'countries');
const TESLA_BRAND = 'TESLA';
const ALLOW_PARTIAL = true;

interface IBrandRegistrations {
  year: number;
  month: number;
  registrations: number;
  country: string;
  brand: string;
}

class Transformer extends BaseTransformer {
  constructor() {
    super({ id: 'car_registrations_by_brand' });
  }

  async transform(): Promise<void> {
    const registrations: IBrandRegistrations[] = [];

    // --------
    // Cargo Austria registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'austria';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Czech Republic registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'czech_republic';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    if (ALLOW_PARTIAL) {
      // --------
      // Cargo Denmark registrations_by_brand.csv
      // Nota: Solo hay datos de agosto 2024 en adelante
      await (async () => {
        const country = 'denmark';
        const dataPath = path.join(
          COUNTRIES_PATH,
          country,
          'registrations_by_brand.csv'
        );
        let data = await this.loadSource(dataPath);
        data = data.filter((r) => r['brand'] === 'TESLA');
        registrations.push(
          ...data.map((r) => {
            const result: IBrandRegistrations = {
              year: r['year'],
              month: r['month'],
              country,
              brand: TESLA_BRAND,
              registrations: r['registrations'],
            };

            return result;
          })
        );
      })();
    }

    // --------
    // Cargo Finland top_30_registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'finland';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'top_30_registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA MOTORS');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo France
    // TODO: falta agregar france

    // --------
    // Cargo Germany registrations_by_model.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'germany';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_model.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');

      // Sumo los modelos en un mismo mes para obtener el total
      const agruped: Object[] = [];
      for (const item of data) {
        const match = agruped.find(
          (a) => a['year'] === item['year'] && a['month'] === item['month']
        );
        if (match) {
          match['value'] += item['value'];
        } else {
          agruped.push({ ...item });
        }
      }

      registrations.push(
        ...agruped.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['value'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Iceland registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'iceland';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Ireland registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'ireland';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Italy registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'italy';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Netherlands registrations_by_model.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'netherlands';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_model.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['model'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Norway top_20_registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'norway';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'top_20_registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    if (ALLOW_PARTIAL) {
      // --------
      // Cargo Poland top_10_ytd_bev_registrations_by_brand.csv
      // Nota: Solo tengo datos de enero 2024 en adelante
      await (async () => {
        const country = 'poland';
        const dataPath = path.join(
          COUNTRIES_PATH,
          country,
          'top_10_ytd_bev_registrations_by_brand.csv'
        );
        let data = await this.loadSource(dataPath);
        data = data.filter((r) => r['brand'] === 'TESLA');
        // Normalizo registrations pq es ytd
        let beforeRegistrations = 0;
        const normalized: object[] = [];
        for (const item of data) {
          normalized.push({
            ...item,
            registrations: item['ytd_registrations'] - beforeRegistrations,
          });

          beforeRegistrations = item['ytd_registrations'];
          if (item['month'] === 12) {
            beforeRegistrations = 0;
          }
        }
        registrations.push(
          ...normalized.map((r) => {
            const result: IBrandRegistrations = {
              year: r['year'],
              month: r['month'],
              country,
              brand: TESLA_BRAND,
              registrations: r['registrations'],
            };

            return result;
          })
        );
      })();
    }

    if (ALLOW_PARTIAL) {
      // --------
      // Cargo Portugal registrations_by_brand.csv
      // Nota: Solo tengo datos de septiembre de 2024 en adelante
      await (async () => {
        const country = 'portugal';
        const dataPath = path.join(
          COUNTRIES_PATH,
          country,
          'registrations_by_brand.csv'
        );
        let data = await this.loadSource(dataPath);
        data = data.filter((r) => r['brand'] === 'TESLA');
        registrations.push(
          ...data.map((r) => {
            const result: IBrandRegistrations = {
              year: r['year'],
              month: r['month'],
              country,
              brand: TESLA_BRAND,
              registrations: r['registrations'],
            };

            return result;
          })
        );
      })();
    }

    // --------
    // Cargo Sweden registrations_by_model.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'sweden';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_model.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');

      // Sumo los modelos en un mismo mes para obtener el total
      const agruped: Object[] = [];
      for (const item of data) {
        const match = agruped.find(
          (a) => a['year'] === item['year'] && a['month'] === item['month']
        );
        if (match) {
          match['registrations'] += item['registrations'];
        } else {
          agruped.push({ ...item });
        }
      }

      registrations.push(
        ...agruped.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Switzerland ytd_registrations_by_model.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'switzerland';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'ytd_registrations_by_model.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');

      // Sumo los modelos en un mismo mes para obtener el total
      const agruped: Object[] = [];
      for (const item of data) {
        const match = agruped.find(
          (a) => a['year'] === item['year'] && a['month'] === item['month']
        );
        if (match) {
          match['ytd_registrations'] += item['ytd_registrations'];
        } else {
          agruped.push({ ...item });
        }
      }

      // Standarizo porque es ytd
      let beforeRegistrations = 0;
      const standarized: Object[] = [];
      for (const item of agruped) {
        standarized.push({
          ...item,
          registrations: item['ytd_registrations'] - beforeRegistrations,
        });

        beforeRegistrations = item['ytd_registrations'];
        if (item['month'] === 12) {
          beforeRegistrations = 0;
        }
      }

      registrations.push(
        ...standarized.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo uk registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'uk';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    if (ALLOW_PARTIAL) {
      // --------
      // Cargo usa registrations_by_brand.csv
      // Nota: Data Tesla OK
      await (async () => {
        const country = 'usa';
        const dataPath = path.join(
          COUNTRIES_PATH,
          country,
          'registrations_by_brand.csv'
        );
        let data = await this.loadSource(dataPath);
        data = data.filter((r) => r['brand'] === 'TESLA');
        registrations.push(
          ...data.map((r) => {
            const result: IBrandRegistrations = {
              year: r['year'],
              month: r['month'],
              country,
              brand: TESLA_BRAND,
              registrations: r['registrations'],
            };

            return result;
          })
        );
      })();
    }

    // --------
    // Cargo spain registrations_by_brand.csv
    // Nota: Data Tesla OK
    await (async () => {
      const country = 'spain';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            country,
            brand: TESLA_BRAND,
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Salvo registrations_by_brand.csv
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(registrations);
    const outputFolder = path.join(
      this.sources_path,
      'car_registrations',
      'global'
    );
    await mkdir(outputFolder, { recursive: true });
    const outputPath = path.join(outputFolder, 'registrations_by_brand.csv');
    await writeFile(outputPath, csv);

    console.log(`> Saved [registrations_by_brand]`);
  }

  async debug(): Promise<void> {
    await this.transform();
  }

  private async loadSource(sourcePath: string): Promise<object[]> {
    const fileContent = await readFile(
      path.join(this.sources_path, sourcePath),
      'utf-8'
    );
    const result = Papa.parse<object>(fileContent, {
      header: true,
      dynamicTyping: true,
    });
    return result.data;
  }
}

export default new Transformer();
