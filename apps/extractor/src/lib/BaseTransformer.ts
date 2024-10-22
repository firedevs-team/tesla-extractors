export abstract class BaseTransformer {
  async run() {
    console.log('');
    console.log(`Running transformers...`);
    await this.transform();
  }

  abstract transform(): Promise<void>;
}
