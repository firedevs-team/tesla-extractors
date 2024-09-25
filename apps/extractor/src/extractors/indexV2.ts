import { BaseExtractorV2 } from '../lib/BaseExtractorV2';
import { kbaExtractor } from './germany/KBAExtractorV2';
import { pfaExtractor } from './france/PFAExtractorV2';

const extractors: BaseExtractorV2[] = [kbaExtractor, pfaExtractor];

export default extractors;
