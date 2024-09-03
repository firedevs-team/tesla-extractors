import fs from 'fs';
import path from 'path';
import { Parser } from 'json2csv';

interface Metadata {
  downloaded: string[];
  transformed: string[];
}

export abstract class BaseAccumulator<S> {
  protected dirPath: string;
  protected metadataPath: string;
  protected downloadPath: string;

  constructor(private sourceName: string, private sourceURL: string) {
    this.dirPath = path.join(
      process.cwd(),
      'data',
      'sales-accumulator',
      this.sourceName
    );
    this.metadataPath = path.join(this.dirPath, '_.json');
    this.downloadPath = path.join(this.dirPath, 'downloads');

    // Creo la carpeta del acumulador si no existe
    if (!fs.existsSync(this.dirPath)) {
      fs.mkdirSync(this.dirPath, { recursive: true });
    }

    // Creo la metadata si no existe
    if (!fs.existsSync(this.metadataPath)) {
      const metdata: Metadata = { downloaded: [], transformed: [] };
      fs.writeFileSync(this.metadataPath, JSON.stringify(metdata, null, 2));
    }

    // Creo la carpeta de descarga si no existe
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  protected getMetadata(): Metadata {
    return JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
  }

  protected saveMetadata(metadata: Metadata): void {
    fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
  }

  protected abstract transform(filePath: string): Promise<S[]>;

  async run(): Promise<void> {
    console.log(`Running ${this.sourceName} accumulator...`);

    // Con la url donde está la fuente de las ventas,
    // Descargo las últimas 3 urls de información de ventas
    // De la información descargada, obtengo el año y mes de cada url
    // Ex: [
    //         { year: 2024, month: 1, url: 'http://www.ventas.com/2024/01.pdf' },
    //         { year: 2024, month: 2, url: 'http://www.ventas.com/2024/02.pdf' },
    //         { year: 2024, month: 3, url: 'http://www.ventas.com/2024/03.pdf' }
    //     ]
    // Busco en la metadata si las info urls ya fueron descargadas
    // Descargo las que no fueron descargadas y las dejo en la carpeta
    // y actualizo la metadata (downloaded)

    // Anlizo que no ha sido transformado comparando donwloaded y transformed.
    // Transformo las que no han sido transformadas y las dejo en data.csv
    const metadata = this.getMetadata();
    for (const fileName of metadata.downloaded) {
      if (!metadata.transformed.includes(fileName)) {
        const sales = await this.transform(
          path.join(path.join(this.downloadPath, fileName))
        );

        // Guardo las ventas en data.csv
        if (sales.length > 0) {
          const json2csvParser = new Parser({});
          const csv = json2csvParser.parse(sales);
          const filePath = path.join(this.dirPath, 'data.csv');
          const fileExists = fs.existsSync(filePath);

          let csvData = csv;
          // Si el archivo existe, omite la cabecera
          if (fileExists) {
            csvData = csv.split('\n').slice(1).join('\n');
          }

          fs.appendFileSync(filePath, csvData);
        }

        // Actualizo la metadata
        metadata.transformed.push(fileName);
        this.saveMetadata(metadata);

        console.log(`> ${fileName} transformed.`);
      }
    }
  }
}
