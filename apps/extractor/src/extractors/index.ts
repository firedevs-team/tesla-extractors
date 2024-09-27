import { BaseExtractor } from '../lib/BaseExtractor';
import { kbaExtractor } from './germany/KBAExtractor';
import { pfaExtractor } from './france/PFAExtractor';
import { unraeExtractor } from './italy/UNRAEExtractor';
import { ofvExtractor } from './norway/OFVExtractor';
import { bovagExtractor } from './netherlands/BOVAGExtractor';

const extractors: BaseExtractor[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
  ofvExtractor,
  bovagExtractor,
];

export default extractors;
