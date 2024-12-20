import Papa from 'papaparse';
import { BaseGenerator } from '../../lib';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { Parser } from 'json2csv';
import chalk from 'chalk';

const COUNTRIES_PATH = path.join('car_registrations', 'countries');

interface IBrandRegistrations {
  year: number;
  month: number;
  registrations: number;
  region: 'USA' | 'CANADA' | 'EUROPE' | 'CHINA' | 'ROW';
  country: string;
}

class Generator extends BaseGenerator {
  constructor() {
    super({ id: 'tesla_monthly_registrations' });
  }

  async generate(): Promise<void> {
    const registrations: IBrandRegistrations[] = [];

    // --------
    // Cargo USA registrations_by_brand.csv
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
            region: 'USA',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Austria registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Czech Republic registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Denmark registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Finland top_30_registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo France registrations_by_brand.csv
    await (async () => {
      const country = 'france';
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Germany registrations_by_model.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['value'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Iceland registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Ireland registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Italy registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Netherlands registrations_by_model.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Norway top_20_registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Poland top_10_ytd_bev_registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Portugal registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Sweden registrations_by_model.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Switzerland ytd_registrations_by_model.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo UK registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Spain registrations_by_brand.csv
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Belgium registrations_by_brand.csv
    await (async () => {
      const country = 'belgium';
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Greece ytd_registrations_by_brand.csv
    await (async () => {
      const country = 'greece';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'ytd_registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');

      // Standarizo porque es ytd
      let beforeRegistrations = 0;
      const standarized: Object[] = [];
      for (const item of data) {
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Luxembourg registrations_by_brand.csv
    await (async () => {
      const country = 'luxembourg';
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Romania top_ytd_bev_registrations_by_brand.csv
    await (async () => {
      const country = 'romania';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'top_ytd_bev_registrations_by_brand.csv'
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
            region: 'EUROPE',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo China tesla_sales.csv
    await (async () => {
      const country = 'china';
      const dataPath = path.join(COUNTRIES_PATH, country, 'tesla_sales.csv');
      let data = await this.loadSource(dataPath);

      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            region: 'CHINA',
            country: country.toUpperCase(),
            registrations: r['sales'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Turkey registrations_by_brand.csv
    await (async () => {
      const country = 'turkey';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Japan registrations_by_brand.csv
    await (async () => {
      const country = 'japan';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      // En japón los datos de Tesla están en OTHERS
      // pero parece que la mayoría de OTHERS son Tesla
      data = data.filter((r) => r['brand'] === 'OTHERS');
      registrations.push(
        ...data.map((r) => {
          const result: IBrandRegistrations = {
            year: r['year'],
            month: r['month'],
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Israel ytd_registrations_by_brand.csv
    await (async () => {
      const country = 'israel';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'ytd_registrations_by_brand.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['brand'] === 'TESLA');

      // Standarizo porque es ytd
      let beforeRegistrations = 0;
      const standarized: Object[] = [];
      for (const item of data) {
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo New Zealand registrations_by_brand.csv
    await (async () => {
      const country = 'new_zealand';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Chile registrations_by_brand.csv
    await (async () => {
      const country = 'chile';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Australia registrations_by_brand.csv
    await (async () => {
      const country = 'australia';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Hong Kong registrations_by_brand.csv
    await (async () => {
      const country = 'hong_kong';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo South Korea registrations_by_brand.csv
    await (async () => {
      const country = 'south_korea';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Thailand registrations_by_model.csv
    await (async () => {
      const country = 'thailand';
      const dataPath = path.join(
        COUNTRIES_PATH,
        country,
        'registrations_by_model.csv'
      );
      let data = await this.loadSource(dataPath);
      data = data.filter((r) => r['model'].startsWith('TESLA'));

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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Singapore registrations_by_brand.csv
    await (async () => {
      const country = 'singapore';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Cargo Malaysia registrations_by_brand.csv
    await (async () => {
      const country = 'malaysia';
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
            region: 'ROW',
            country: country.toUpperCase(),
            registrations: r['registrations'],
          };

          return result;
        })
      );
    })();

    // --------
    // Salvo tesla_monthly_registrations.csv
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(registrations);
    const outputPath = path.join(
      this.generated_path,
      'tesla_monthly_registrations.csv'
    );
    await writeFile(outputPath, csv);

    console.log(`> ${chalk.gray(`Saved [tesla_monthly_registrations]`)}`);
  }

  async debug(): Promise<void> {}

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

export default new Generator();
