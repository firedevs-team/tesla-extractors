import { BaseExtractorV2 } from '../lib/BaseExtractorV2';
import { kbaExtractor } from './germany/KBAExtractorV2';
import { pfaExtractor } from './france/PFAExtractorV2';
import { unraeExtractor } from './italy/UNRAEExtractorV2';

const extractors: BaseExtractorV2[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
];

export default extractors;
