import fs from 'fs';
import path from 'path';
import { Parser } from 'json2csv';

interface Metadata {
  downloaded: Record<string, string[]>;
  transformed: Record<string, string[]>;
}

export abstract class BaseAccumulator {
  protected dirPath: string;
  protected metadataPath: string;
  protected downloadPath: string;

  constructor(private sourceName: string) {
    this.dirPath = path.join(
      process.cwd(),
      'data',
      'accumulator',
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
      const metdata: Metadata = { downloaded: {}, transformed: {} };
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

  protected abstract transform(id: string, version: string): Promise<Object[]>;

  async run(): Promise<void> {
    console.log(`Running ${this.sourceName} accumulator...`);

    // Anlizo que no ha sido transformado comparando downloaded y transformed.
    // Transformo las que no han sido transformadas y las dejo en data.csv
    const metadata = this.getMetadata();
    const ids = Object.keys(metadata.downloaded);
    for (const id of ids) {
      for (const version of metadata.downloaded[id]) {
        if (!metadata.transformed[id]?.includes(version)) {
          const data = await this.transform(id, version);

          // Guardo la data en ${id}.csv
          if (data.length > 0) {
            const json2csvParser = new Parser({});
            const csv = json2csvParser.parse(data);
            const filePath = path.join(this.dirPath, `${id}.csv`);
            const fileExists = fs.existsSync(filePath);

            let csvData = csv;
            // Si el archivo existe, omite la cabecera
            if (fileExists) {
              csvData = `\n${csv.split('\n').slice(1).join('\n')}`;
            }

            fs.appendFileSync(filePath, csvData);
          }

          // Actualizo la metadata
          if (!metadata.transformed[id]) {
            metadata.transformed[id] = [];
          }
          metadata.transformed[id].push(version);
          this.saveMetadata(metadata);

          console.log(`> ${id} ${version} transformed.`);
        }
      }
    }
  }
}
