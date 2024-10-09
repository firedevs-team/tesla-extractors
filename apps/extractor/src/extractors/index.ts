import { BaseExtractor } from '../lib/BaseExtractor';
import kbaExtractor from './car_registrations/germany/KBAExtractor';
import pfaExtractor from './car_registrations/france/PFAExtractor';
import unraeExtractor from './car_registrations/italy/UNRAEExtractor';
import ofvExtractor from './car_registrations/norway/OFVExtractor';
import bovagExtractor from './car_registrations/netherlands/BOVAGExtractor';
import statistikTotalExtractor from './car_registrations/austria/StatistikTotalExtractor';
import statistikProvisionalExtractor from './car_registrations/austria/StatistikProvisionalExtractor';
import sdaciaExtractor from './car_registrations/czech_republic/SDACIAExtractor';
import mobilityExtractor from './car_registrations/denmark/MobilityExtractor';
import autExtractor from './car_registrations/finland/AUTExtractor';
import shareholderDeckExtractor from './tesla_ir_info/ShareholderDeckExtractor';

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
  shareholderDeckExtractor,
];

export default extractors;
