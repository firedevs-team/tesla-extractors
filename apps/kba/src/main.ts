import fs from 'fs';
import { Parser } from 'json2csv';
import path from 'path';
import xlsx from 'xlsx';

interface Registration {
  month: number;
  year: number;
  mark: string;
  model?: string;
  value?: number;
}

const parseRegistrations = (fz10Path: string) => {
  const registrations: Registration[] = [];
  const workbook: xlsx.WorkBook = xlsx.readFile(fz10Path);

  // Selecciona la primera hoja de trabajo (worksheet)
  const worksheet: xlsx.WorkSheet = workbook.Sheets[workbook.SheetNames[3]];

  // Extraigo el mes y el año del nombre del fichero
  const parts = path.basename(fz10Path).split('_');
  const year = parseInt(parts[1]);
  const month = parseInt(parts[2].split('.')[0]);

  // Convierte la hoja de trabajo en un objeto JSON
  const data: any[] = xlsx.utils.sheet_to_json(worksheet);

  // Elimino los 4 primeros elementos
  data.splice(0, 5);
  // Elimino los ultimos tres elementos
  data.splice(-3);

  // Para este caso debo eliminar una fila mas inicialmente
  const firsLinexceptions = [{ year: 2023, month: 10 }];
  if (firsLinexceptions.some((e) => e.year === year && e.month === month)) {
    data.splice(0, 1);
  }

  // Para este caso debo eliminar una fila mas al final
  const endLinesExceptions = [{ year: 2023, month: 5, lines: 2 }];
  if (endLinesExceptions.some((e) => e.year === year && e.month === month)) {
    data.splice(
      -endLinesExceptions.find((e) => e.year === year && e.month === month)
        .lines
    );
  }

  let mark: string;

  let markKey: string;
  let modelKey: string;
  let registeredKey: string;
  let dontHaveMark = true;
  for (const item of data) {
    const keys = Object.keys(item);

    // Por cada item defino cuales son los keys
    // de la marca, modelo y registrado

    if (markKey === undefined || markKey === keys[0]) {
      // Caso tiene marca
      markKey = keys[0];
      modelKey = keys[1];
      registeredKey = keys[2];
      dontHaveMark = false;
    } else {
      // Caso no tiene marca
      modelKey = keys[0];
      registeredKey = keys[1];
      dontHaveMark = true;
    }

    mark = dontHaveMark ? mark : item[markKey];
    let model = item[modelKey];
    let registered = item[registeredKey];

    // if (item['zurück zum Inhaltsverzeichnis']) {
    //   mark = item['zurück zum Inhaltsverzeichnis'];
    // }
    // let model = item['__EMPTY'];
    // let registered = item['__EMPTY_1'];
    // if (!('__EMPTY' in item)) {
    //   model = item['__EMPTY_1'];
    //   registered = item['__EMPTY_2'];
    // }

    // Hay un caso en que la marca
    // es el total de todas las marcas
    if (mark.endsWith(' ZUSAMMEN')) {
      continue;
    }

    if (model === 'SONSTIGE') {
      continue;
    }

    // "DE",10,2023,"MARKE","MODELLREIHE",NaN

    // if (month === 10 && year === 2023 && mark === 'VOLKSWAGEN') {
    //   if (cont < 4) {
    //     console.log(item);
    //     cont++;
    //   }
    // }

    registrations.push({
      month,
      year,
      mark: (mark + '').toUpperCase().trim(),
      model: model ? (model + '').toUpperCase().trim() : undefined,
      value: registered != '-' ? parseInt(registered) : undefined,
    });

    // console.log(`Mark: ${mark} | Model: ${model} | Registered: ${registered}`);
  }

  return registrations;
};

const run = async () => {
  const documentsDir = path.join(
    process.cwd(),
    'data',
    'kba',
    'fz10',
    'documents'
  );

  const registrations: Registration[] = [];
  const fz10Files = await fs.promises.readdir(documentsDir);
  for (const fz10File of fz10Files) {
    const filePath = path.join(documentsDir, fz10File);
    registrations.push(...parseRegistrations(filePath));
    // // Abrir en vs code
    // const tmpFile = path.join(os.tmpdir(), `${new Date().getTime()}.json`);
    // fs.writeFileSync(tmpFile, JSON.stringify(registrations, null, 2));
    // execSync(`code ${tmpFile}`);
  }

  // // Salvar csv con los datos
  // const fields = [
  //   'country_code',
  //   'month',
  //   'year',
  //   'mark',
  //   'model',
  //   'registered',
  // ];
  // const json2csvParser = new Parser({ fields });
  // const csv = json2csvParser.parse(registrations);
  // fs.writeFile(
  //   path.join(process.cwd(), 'data', 'kba', 'fz10', 'processed', 'data.csv'),
  //   csv,
  //   function (err) {
  //     if (err) {
  //       console.error('Error al guardar el archivo CSV:', err);
  //       return;
  //     }
  //     console.log('Archivo CSV guardado correctamente.');
  //   }
  // );

  // Salvar json con los datos
  const filePath = path.join(
    process.cwd(),
    'data',
    'processed',
    'Alemania',
    'car-registration.json'
  );
  fs.writeFileSync(filePath, JSON.stringify(registrations, null, 2));
};

run();
