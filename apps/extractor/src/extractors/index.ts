import { BaseExtractor } from '../lib/BaseExtractor';
import kbaExtractor from './car_registrations/germany/kba/Extractor';
import pfaExtractor from './car_registrations/france/pfa/Extractor';
import unraeExtractor from './car_registrations/italy/unrae/Extractor';
import ofvExtractor from './car_registrations/norway/ofv/Extractor';
import bovagExtractor from './car_registrations/netherlands/bovag/Extractor';
import statistikTotalExtractor from './car_registrations/austria/statistik_total/Extractor';
import statistikProvisionalExtractor from './car_registrations/austria/statistik_provisional/Extractor';
import sdaciaExtractor from './car_registrations/czech_republic/sdacia/Extractor';
import mobilityExtractor from './car_registrations/denmark/mobility/Extractor';
import autExtractor from './car_registrations/finland/aut/Extractor';
import samgongustofaExtractor from './car_registrations/iceland/samgongustofa/Extractor';
import shareholderDeckExtractor from './tesla_ir_info/sharehold_deck/Extractor';

const extractors: BaseExtractor[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
  ofvExtractor,
  bovagExtractor,
  statistikTotalExtractor,
  statistikProvisionalExtractor,
  sdaciaExtractor,
  mobilityExtractor,
  autExtractor,
  samgongustofaExtractor,
  shareholderDeckExtractor,
];

export default extractors;
