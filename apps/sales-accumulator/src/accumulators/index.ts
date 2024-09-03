import { KBAAccumulator } from './KBA';
import { CNEVTeslaTotalAccumulator } from './CNEVTeslaTotal';
import { CNEVTeslaRetailAccumulator } from './CNEVTeslaRetail';
import { CNEVTeslaExportAccumulator } from './CNEVTeslaExport';
import { CNEVXpengDeliveriesAccumulator } from './CNEVXpengDeliveries';

export default [
  new KBAAccumulator(),
  new CNEVTeslaTotalAccumulator(),
  new CNEVTeslaRetailAccumulator(),
  new CNEVTeslaExportAccumulator(),
  new CNEVXpengDeliveriesAccumulator(),
];
