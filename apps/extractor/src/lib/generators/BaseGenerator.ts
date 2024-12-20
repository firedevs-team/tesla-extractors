import fs from 'fs';
import path from 'path';

interface IConfig {
  id: string;
}

export abstract class BaseGenerator {
  protected config: IConfig;
  protected sources_path: string;
  protected generated_path: string;

  constructor(config: IConfig) {
    this.config = config;

    this.sources_path = path.join(process.cwd(), 'data', 'sources');
    this.generated_path = path.join(this.sources_path, '_generated');

    // Creo los folders
    fs.mkdirSync(this.sources_path, { recursive: true });
    fs.mkdirSync(this.generated_path, { recursive: true });
  }

  getId() {
    return this.config.id;
  }

  /**
   * Ejectua el generador
   */
  async run() {
    console.log('');
    console.log(`Running generator...`);
    await this.generate();
  }

  /**
   * Hace la generacion de contenido, usando
   * las fuentes y agregando información calculada
   */
  abstract generate(): Promise<void>;

  /**
   * Metodo para debuggear el generador
   */
  async debug(): Promise<void> {}
}
