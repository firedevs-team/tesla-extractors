// import fs from 'fs';
// import path from 'path';
// import axios from 'axios';
// import { z } from 'zod';
// import pdfParse from 'pdf-parse';
// import { Parser } from 'json2csv';
// import * as cheerio from 'cheerio';
// import { ChatOpenAI } from '@langchain/openai';
// import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// const outputSchema = z.object({
//   consolidated_statement: z
//     .object({
//       revenues_vehicle_sales: z
//         .string()
//         .transform((val) => {
//           console.log(val);
//           return parseInt(val.replace(/,/g, ''), 10);
//         })
//         .describe('Revenues vehicle sales'),
//       revenues_services_and_others: z
//         .string()
//         .transform((val) => parseInt(val.replace(/,/g, ''), 10))
//         .describe('Revenues services and others'),
//       cost_of_sales_vehicle_sales: z
//         .string()
//         .transform((val) => parseInt(val.replace(/,/g, ''), 10))
//         .describe('Cost of sales vehicle sales'),
//       cost_of_sales_services_and_others: z
//         .string()
//         .transform((val) => parseInt(val.replace(/,/g, ''), 10))
//         .describe('Cost of sales services and others'),
//       operating_expenses_research_and_development: z
//         .string()
//         .transform((val) => parseInt(val.replace(/,/g, ''), 10))
//         .describe('Operating expenses research and development'),
//       operating_expenses_selling_general_and_administrative_expenses: z
//         .string()
//         .transform((val) => parseInt(val.replace(/,/g, ''), 10))
//         .describe(
//           'Operating expenses selling general and administrative expenses'
//         ),
//     })
//     .describe('Consolidated statement'),
// });

// const downloadReports = async () => {
//   // Descargar la página web
//   const { data } = await axios.get(
//     'https://ir.xiaopeng.com/financials/quarterly-results'
//   );

//   // Encontrar todos los links de los reportes
//   const $ = cheerio.load(data);

//   const results: any[] = [];
//   $('div.view-grouping').each((_, element) => {
//     const year = parseInt($(element).find('h2').text().trim());

//     // Buscar dentro de cada 'view-grouping-content'
//     $(element)
//       .find('div.view-grouping-content')
//       .each((_, contentElement) => {
//         const titles = $(contentElement).find('div.acc-title');
//         const bodies = $(contentElement).find('div.acc-body');

//         titles.each((index) => {
//           const quarter = $(titles[index]).text().trim();

//           $(bodies[index])
//             .find('a')
//             .each((_, linkElement) => {
//               const linkText = $(linkElement).text().trim();
//               if (linkText === 'Earnings Release') {
//                 const link = `https://ir.xiaopeng.com${$(linkElement).attr(
//                   'href'
//                 )}`;
//                 if (link) {
//                   results.push({ year, quarter, link });
//                 }
//               }
//             });
//         });
//       });
//   });

//   // Descargar los reportes en la carpeta
//   const downloadDir = path.join(process.cwd(), 'data', 'companies', 'xpeng');

//   for (const result of results) {
//     const { year, quarter, link } = result;
//     const fileName = `${year}-${quarter}.pdf`;
//     const filePath = path.join(downloadDir, fileName);

//     try {
//       const { data } = await axios.get(link, {
//         responseType: 'stream',
//       });

//       const writer = data.pipe(fs.createWriteStream(filePath));
//       writer.on('finish', () => {
//         console.log(`Descargado ${fileName}`);
//       });
//     } catch (error) {
//       console.error(`Error al descargar ${fileName}`);
//     }
//   }
// };

// const extractConsolidatedStatement = async (reportFilePath: string) => {
//   // Del filename extraigo el año y el quarter
//   const parts = path.basename(reportFilePath).replace('.pdf', '').split('-');
//   const year = parseInt(parts[0]);
//   const quarter = parts[1];

//   const dataBuffer = fs.readFileSync(reportFilePath);
//   const data = await pdfParse(dataBuffer);

//   // DEBUG CODE
//   //   console.log(data.text);

//   // Envio contenido a open ai para extraer los insights

//   const model = new ChatOpenAI({
//     model: 'gpt-4o',
//     temperature: 0,
//     apiKey:
//       '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',
//   });
//   const structuredLlm = model.withStructuredOutput(outputSchema, {
//     name: 'consolidated_statement',
//   });

//   const { consolidated_statement } = await structuredLlm.invoke([
//     new SystemMessage(
//       `Extrae del siguiente reporte de ingresos del año ${year} del quarter ${quarter} de Xpeng la información financiera definida en el output.
//     - Estos datos se deben obtener de la columna de US$ / USD.
//     - Los datos extraidos se deben tomar exactamente como aparecen en el reporte, solo los números y las comas, sin texto adicional.
//     `
//     ),
//     new HumanMessage(`Reporte: ${data.text}`),
//   ]);

//   //   DEBUG CODE
//   console.log(consolidated_statement);

//   console.log('Extraído el statement del reporte:', reportFilePath);

//   return {
//     year,
//     quarter,
//     ...consolidated_statement,
//   };
// };

// const saveConsolidatedStatement = async () => {
//   const dataPath = path.join(process.cwd(), 'data', 'input', 'xpeng');

//   // Extraigo los statements de los reportes
//   const files = fs.readdirSync(dataPath);
//   const statements: any = [];
//   for (const file of files) {
//     const reportFilePath = path.join(dataPath, file);
//     const statement = await extractConsolidatedStatement(reportFilePath);
//     statements.push(statement);
//   }

//   // Guardo csv con los statements
//   // Salvar csv con los datos
//   //   const fields = [
//   //     'revenues_vehicle_sales',
//   //     'revenues_services_and_others',
//   //     'cost_of_sales_vehicle_sales',
//   //     'cost_of_sales_services_and_others',
//   //     'operating_expenses_research_and_development',
//   //     'operating_expenses_selling_general_and_administrative_expenses',
//   //   ];
//   const json2csvParser = new Parser({});
//   const csv = json2csvParser.parse(statements);
//   fs.writeFile(
//     path.join(process.cwd(), 'data', 'output', 'xpeng', 'statements.csv'),
//     csv,
//     function (err) {
//       if (err) {
//         console.error('Error al guardar el archivo CSV:', err);
//         return;
//       }
//       console.log('Archivo CSV guardado correctamente.');
//     }
//   );
// };

// const run = async () => {
//   // await downloadReports();
//   await saveConsolidatedStatement();
// };

// run();
