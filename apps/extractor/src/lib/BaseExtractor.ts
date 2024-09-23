import { mkdirSync } from 'fs';
import path from 'path';

const EXTRACTOR_PATH = path.join(process.cwd(), 'data', 'extractor');

export abstract class BaseExtractor {
  protected folder: string;
  protected source: string;
  protected downloadsPath: string;
  protected dataPath: string;

  constructor(folder: string, source: string) {
    this.folder = folder;
    this.source = source;
    this.downloadsPath = path.join(EXTRACTOR_PATH, folder, 'downloads', source);
    this.dataPath = path.join(EXTRACTOR_PATH, folder, 'data', source);

    // Crear directorios
    // downloads
    mkdirSync(this.downloadsPath, { recursive: true });
    // data
    mkdirSync(this.dataPath, { recursive: true });
  }

  async run(): Promise<void> {
    console.log(`Running [${this.folder}] ${this.source} extractor...`);
    await this.extract();
  }

  abstract extract(): Promise<void>;
}
