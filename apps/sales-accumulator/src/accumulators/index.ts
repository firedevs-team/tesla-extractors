import { KBAAccumulator } from './KBA';
import { CNEVTeslaTotalAccumulator } from './CNEVTeslaTotal';
import { CNEVTeslaRetailAccumulator } from './CNEVTeslaRetail';

export default [
  new KBAAccumulator(),
  new CNEVTeslaTotalAccumulator(),
  new CNEVTeslaRetailAccumulator(),
];
