import { BaseExtractor } from '../lib/BaseExtractor';
import kbaExtractor from './car_registrations/germany/KBAExtractor';
import pfaExtractor from './car_registrations/france/PFAExtractor';
import unraeExtractor from './car_registrations/italy/UNRAEExtractor';
import ofvExtractor from './car_registrations/norway/OFVExtractor';
import bovagExtractor from './car_registrations/netherlands/BOVAGExtractor';
import statistikTotalExtractor from './car_registrations/austria/StatistikTotalExtractor';
import shareholderDeckExtractor from './tesla_ir_info/ShareholderDeckExtractor';

const extractors: BaseExtractor[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
  ofvExtractor,
  bovagExtractor,
  statistikTotalExtractor,
  shareholderDeckExtractor,
];

export default extractors;
