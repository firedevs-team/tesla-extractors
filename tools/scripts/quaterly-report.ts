import path from 'path';
import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import Table from 'cli-table3';

interface Registrations {
  year: number;
  month: number;
  country: string;
  brand: string;
  registrations: number;
}

const run = async () => {
  const filePath = path.join(
    process.cwd(),
    'data',
    'sources',
    'car_registrations',
    'global',
    'registrations_by_brand.csv'
  );
  const fileContent = await readFile(filePath, 'utf-8');
  const result = Papa.parse<Registrations>(fileContent, {
    header: true,
    dynamicTyping: true,
  });

  // Extraer los registros de octubre 2024
  const octoberRegistrations = result.data.filter(
    (r) => r.year === 2024 && r.month === 10
  );

  // Extraer los registros de julio 2024
  const julyRegistrations: Registrations[] = [];
  for (const octRegs of octoberRegistrations) {
    const match = result.data.find(
      (r) => r.country === octRegs.country && r.year === 2024 && r.month === 7
    );
    if (match) {
      julyRegistrations.push(match);
    }
  }

  // Extraer los registros de octubre 2023
  const oct23Registrations: Registrations[] = [];
  for (const octRegs of octoberRegistrations) {
    const match = result.data.find(
      (r) => r.country === octRegs.country && r.year === 2023 && r.month === 10
    );
    if (match) {
      oct23Registrations.push(match);
    }
  }

  // Crear la tabla
  const table = new Table({
    head: [
      'Country',
      'Q4-24',
      'Q3-24',
      'Q4-23',
      'QoQ %',
      'QoQ Diff',
      'YoY %',
      'YoY Diff',
    ],
    colWidths: [20, 10, 10, 10, 10, 10, 10, 10],
  });

  // Variables para acumular los totales
  let totalQ4_24 = 0;
  let totalQ3_24 = 0;
  let totalQ4_23 = 0;
  let totalQoqDifference = 0;
  let totalYoyDifference = 0;

  for (const octRegs of octoberRegistrations) {
    const julRegs = julyRegistrations.find(
      (r) => r.country === octRegs.country
    );
    const oct23Regs = oct23Registrations.find(
      (r) => r.country === octRegs.country
    );

    const q4_24 = octRegs.registrations;
    const q3_24 = julRegs ? julRegs.registrations : 0;
    const q4_23 = oct23Regs ? oct23Regs.registrations : 0;

    const qoq = julRegs
      ? ((q4_24 - julRegs.registrations) * 100) / julRegs.registrations
      : '-';
    const qoqDifference = julRegs ? q4_24 - julRegs.registrations : 0;

    const yoy = oct23Regs
      ? ((q4_24 - oct23Regs.registrations) * 100) / oct23Regs.registrations
      : '-';
    const yoyDifference = oct23Regs ? q4_24 - oct23Regs.registrations : 0;

    // Acumular los totales
    totalQ4_24 += q4_24;
    totalQ3_24 += q3_24;
    totalQ4_23 += q4_23;
    totalQoqDifference += typeof qoqDifference === 'number' ? qoqDifference : 0;
    totalYoyDifference += typeof yoyDifference === 'number' ? yoyDifference : 0;

    // Agregar la fila a la tabla
    table.push([
      octRegs.country,
      q4_24,
      q3_24 || '-',
      q4_23 || '-',
      qoq !== '-' ? `${Math.round(qoq)}%` : '-',
      qoqDifference || '-',
      yoy !== '-' ? `${Math.round(yoy)}%` : '-',
      yoyDifference || '-',
    ]);
  }

  // Agregar la fila de totales al final de la tabla
  table.push([
    'Total',
    totalQ4_24,
    totalQ3_24,
    totalQ4_23,
    '', // No sumamos porcentajes
    totalQoqDifference,
    '',
    totalYoyDifference,
  ]);

  // Mostrar la tabla en la consola
  console.log(table.toString());
};

run();
