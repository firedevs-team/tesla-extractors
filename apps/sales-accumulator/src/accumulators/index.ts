import { KBAAccumulator } from './KBA';
import { CNEVTeslaTotalAccumulator } from './CNEVTeslaTotal';
import { CNEVTeslaRetailAccumulator } from './CNEVTeslaRetail';
import { CNEVTeslaExportAccumulator } from './CNEVTeslaExport';

export default [
  new KBAAccumulator(),
  new CNEVTeslaTotalAccumulator(),
  new CNEVTeslaRetailAccumulator(),
  new CNEVTeslaExportAccumulator(),
];
