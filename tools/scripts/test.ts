import path from 'path';
import Papa from 'papaparse';
import { readFile } from 'fs/promises';

interface Registrations {
  year: number;
  month: number;
  country: string;
  brand: string;
  registrations: number;
}

interface OperationalSummaryItems {
  year: number;
  quarter: number;
  total_deliveries: number;
}

const getRegistrations = async (): Promise<Registrations[]> => {
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

const getOperationalSummary = async (): Promise<OperationalSummaryItems[]> => {
  const filePath = path.join(
    process.cwd(),
    'data',
    'sources',
    'tesla_ir_info',
    'operational_summary.csv'
  );
  const fileContent = await readFile(filePath, 'utf-8');
  const result = Papa.parse<OperationalSummaryItems>(fileContent, {
    header: true,
    dynamicTyping: true,
  });
  return result.data;
};

const run = async () => {
  const [registrations, operationsSummary] = await Promise.all([
    getRegistrations(),
    getOperationalSummary(),
  ]);

  const year = 2024;
  const quarter = 1;
  const months = [1, 2, 3];

  const totalFromSummary = operationsSummary.reduce((acc, item) => {
    if (item.year === year && item.quarter === quarter) {
      acc += item.total_deliveries;
    }
    return acc;
  }, 0);

  const totalFromRegistrations = registrations.reduce((acc, item) => {
    if (item.year === year && months.includes(item.month)) {
      acc += item.registrations;
    }
    return acc;
  }, 0);

  console.log('Year', year);
  console.log('Quarter', quarter);
  console.log({
    total_deliveries: totalFromSummary,
    total_deliveries_from_registrations: totalFromRegistrations,
    stats: {
      perc: (totalFromRegistrations * 100) / totalFromSummary,
      diff: totalFromSummary - totalFromRegistrations,
    },
  });
  console.log('');

  // Creo la lista de paises
  const countries: string[] = [];
  for (const item of registrations) {
    if (!countries.includes(item.country)) {
      countries.push(item.country);
    }
  }

  // Determino cada mes que pais falta por registrations
  const dates = [
    [2023, 1],
    [2023, 2],
    [2023, 3],
    [2023, 4],
    [2023, 5],
    [2023, 6],
    [2023, 7],
    [2023, 8],
    [2023, 9],
    [2023, 10],
    [2023, 11],
    [2023, 12],
    [2024, 1],
    [2024, 2],
    [2024, 3],
    [2024, 4],
    [2024, 5],
    [2024, 6],
    [2024, 7],
    [2024, 8],
    [2024, 9],
    [2024, 10],
    [2024, 11],
  ];
  for (const [year, month] of dates) {
    for (const country of countries) {
      const total = registrations.reduce((acc, item) => {
        if (
          item.year === year &&
          item.month === month &&
          item.country === country
        ) {
          acc += item.registrations;
        }
        return acc;
      }, 0);
      if (total === 0) {
        console.log(`No data for ${year}/${month} in ${country}`);
      }
    }
  }
};

run();
