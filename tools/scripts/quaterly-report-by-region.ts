import path from 'path';
import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import Table from 'cli-table3';

const MONTH_MAP: Record<number, string> = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Aug',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dec',
};

interface Registrations {
  year: number;
  month: number;
  region: string;
  country: string;
  brand: string;
  registrations: number;
}

const loadData = async () => {
  const filePath = path.join(
    process.cwd(),
    'data',
    'sources',
    'car_registrations',
    'global',
    'tesla_registrations.csv'
  );
  const fileContent = await readFile(filePath, 'utf-8');
  const result = Papa.parse<Registrations>(fileContent, {
    header: true,
    dynamicTyping: true,
  });
  return result.data;
};

const fillTotalCountriesByRegion = (
  registrations: Registrations[]
): Record<string, number> => {
  const totalCountriesByRegion: Record<string, number> = {};
  const countryCounted: Record<string, boolean> = {};
  for (const r of registrations) {
    if (!countryCounted[r.country]) {
      if (totalCountriesByRegion[r.region] === undefined) {
        totalCountriesByRegion[r.region] = 0;
      }
      totalCountriesByRegion[r.region]++;
      countryCounted[r.country] = true;
    }
  }
  return totalCountriesByRegion;
};

const run = async () => {
  const registrations = await loadData();

  // Estos parametros los cambios en el proximo Quarter
  const currentYear = 2024;
  const prevYear = 2023;
  const currentQuarter = 'Q4';
  const prevQuarter = 'Q3';
  const currentQuarterMonths = [12, 11, 10];
  const prevQuarterMonths = [9, 8, 7];

  const shortCurrentYear = currentYear % 100;
  const shortPrevYear = prevYear % 100;

  const totalCountriesByRegion = fillTotalCountriesByRegion(registrations);

  console.log('Total countries by region:', totalCountriesByRegion);

  const table = new Table({
    head: [
      'Region',
      currentQuarter,
      MONTH_MAP[currentQuarterMonths[0]],
      MONTH_MAP[currentQuarterMonths[1]],
      MONTH_MAP[currentQuarterMonths[2]],
      prevQuarter,
      MONTH_MAP[prevQuarterMonths[0]],
      MONTH_MAP[prevQuarterMonths[1]],
      MONTH_MAP[prevQuarterMonths[2]],
      `${currentQuarter}-${shortPrevYear}`,
      MONTH_MAP[currentQuarterMonths[0]],
      MONTH_MAP[currentQuarterMonths[1]],
      MONTH_MAP[currentQuarterMonths[2]],
    ],
    colWidths: [12, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  });

  const findRegistrations = (
    year: number,
    month: number,
    region: string
  ): { total: number | null; complete: boolean } => {
    let total = 0;
    let totalCountries = 0;
    for (const regs of registrations) {
      if (
        regs.year === year &&
        regs.month === month &&
        regs.region === region
      ) {
        total += regs.registrations;
        totalCountries++;
      }
    }

    if (total === 0) {
      return { total: null, complete: false };
    }

    return {
      total,
      complete: totalCountries === totalCountriesByRegion[region],
    };
  };

  const getRow = (region: string) => {
    const _region = region.toUpperCase();
    const registrationsCurrentQuarter = currentQuarterMonths.map((month) =>
      findRegistrations(currentYear, month, _region)
    );
    const totalRegistrationsCurrentQuarter = registrationsCurrentQuarter.reduce(
      (acc, r) => acc + (r.total || 0),
      0
    );

    const registrationsPrevQuarter = prevQuarterMonths.map((month) =>
      findRegistrations(currentYear, month, _region)
    );
    const totalRegistrationsPrevQuarter = registrationsPrevQuarter.reduce(
      (acc, r) => acc + (r.total || 0),
      0
    );

    const registrationsPrevYear = prevQuarterMonths.map((month) =>
      findRegistrations(prevYear, month, _region)
    );
    const totalRegistrationsPrevYear = registrationsPrevYear.reduce(
      (acc, r) => acc + (r.total || 0),
      0
    );

    return [
      region,
      totalRegistrationsCurrentQuarter,
      ...registrationsCurrentQuarter.map((r) =>
        r.complete ? `${r.total}` : r.total === null ? '-' : `${r.total}*`
      ),
      totalRegistrationsPrevQuarter,
      ...registrationsPrevQuarter.map((r) =>
        r.complete ? `${r.total}` : r.total === null ? '-' : `${r.total}*`
      ),
      totalRegistrationsPrevYear,
      ...registrationsPrevYear.map((r) =>
        r.complete ? `${r.total}` : r.total === null ? '-' : `${r.total}*`
      ),
    ];
  };

  table.push(getRow('USA'));
  table.push(getRow('Canada'));
  table.push(getRow('Europe'));
  table.push(getRow('China'));
  table.push(getRow('ROW'));
  console.log(table.toString());
};

run();
