import { KBAAccumulator } from './KBA';
import { CNEVTeslaTotalAccumulator } from './CNEVTeslaTotal';
import { CNEVTeslaRetailAccumulator } from './CNEVTeslaRetail';
import { CNEVTeslaExportAccumulator } from './CNEVTeslaExport';
import { CNEVXpengDeliveriesAccumulator } from './CNEVXpengDeliveries';
import { ACEAByMarketAndPSAccumulator } from './ACEAByMarketAndPS';

export default [
  new KBAAccumulator(),
  new CNEVTeslaTotalAccumulator(),
  new CNEVTeslaRetailAccumulator(),
  new CNEVTeslaExportAccumulator(),
  new CNEVXpengDeliveriesAccumulator(),
  new ACEAByMarketAndPSAccumulator(),
];
