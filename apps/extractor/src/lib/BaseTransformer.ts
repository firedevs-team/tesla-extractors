import path from 'path';

interface IConfig {
  id: string;
}

export abstract class BaseTransformer {
  protected config: IConfig;
  protected sources_path: string;

  constructor(config: IConfig) {
    this.config = config;
    this.sources_path = path.join(process.cwd(), 'data', 'sources');
  }

  getId() {
    return this.config.id;
  }

  /**
   * Ejectua el transformer
   */
  async run() {
    console.log('');
    console.log(`Running transformers...`);
    await this.transform();
  }

  /**
   * Hace la transformacion de las fuentes
   */
  abstract transform(): Promise<void>;

  /**
   * Metodo para debuggear el transformer
   */
  async debug(): Promise<void> {}
}
