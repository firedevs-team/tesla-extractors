import { BaseTransformer } from '../../../lib';

class Transformer extends BaseTransformer {
  async transform(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

export default new Transformer();
