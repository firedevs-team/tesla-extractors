import { BaseExtractorV2 } from '../lib/BaseExtractorV2';
import { kbaExtractor } from './germany/KBAExtractorV2';
import { pfaExtractor } from './france/PFAExtractorV2';
import { unraeExtractor } from './italy/UNRAEExtractorV2';
import { ofvExtractor } from './norway/OFVExtractor';

const extractors: BaseExtractorV2[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
  ofvExtractor,
];

export default extractors;
