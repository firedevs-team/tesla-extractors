import { BaseExtractor } from '../lib/extractor/BaseExtractor';
import kbaExtractor from './car_registrations/germany/kba/Extractor';
import pfaExtractor from './car_registrations/france/pfa/Extractor';
import unraeExtractor from './car_registrations/italy/unrae/Extractor';
import unraeBrandExtractor from './car_registrations/italy/unrae_brand/Extractor';
import ofvExtractor from './car_registrations/norway/ofv/Extractor';
import bovagExtractor from './car_registrations/netherlands/bovag/Extractor';
import statistikTotalExtractor from './car_registrations/austria/statistik_total/Extractor';
import statistikProvisionalExtractor from './car_registrations/austria/statistik_provisional/Extractor';
import sdaciaExtractor from './car_registrations/czech_republic/sdacia/Extractor';
import mobilityExtractor from './car_registrations/denmark/mobility/Extractor';
import autExtractor from './car_registrations/finland/aut/Extractor';
import samgongustofaExtractor from './car_registrations/iceland/samgongustofa/Extractor';
import beepbeepExtractor from './car_registrations/ireland/beepbeep/Extractor';
import pzpmExtractor from './car_registrations/poland/pzpm/Extractor';
import autoinformaExtractor from './car_registrations/portugal/autoinforma/Extractor';
import mobilityswedenExtractor from './car_registrations/sweden/mobilitysweden/Extractor';
import autoswissExtractor from './car_registrations/switzerland/autoswiss/Extractor';
import smmtExtractor from './car_registrations/uk/smmt/Extractor';
import smmtModelExtractor from './car_registrations/uk/smmt_model/Extractor';
import motorIntelligenceExtractor from './car_registrations/usa/motor_intelligence/Extractor';
import anfacExtractor from './car_registrations/spain/anfac/Extractor';
import shareholderDeckExtractor from './tesla_ir_info/sharehold_deck/Extractor';

const extractors: BaseExtractor[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
  unraeBrandExtractor,
  ofvExtractor,
  bovagExtractor,
  statistikTotalExtractor,
  statistikProvisionalExtractor,
  sdaciaExtractor,
  mobilityExtractor,
  autExtractor,
  samgongustofaExtractor,
  beepbeepExtractor,
  pzpmExtractor,
  autoinformaExtractor,
  mobilityswedenExtractor,
  autoswissExtractor,
  smmtExtractor,
  smmtModelExtractor,
  motorIntelligenceExtractor,
  anfacExtractor,
  shareholderDeckExtractor,
];

export default extractors;
