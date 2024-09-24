import { BaseExtractor } from '../lib/BaseExtractor';
import { kbaExtractor } from './germany/KBAExtractor';
import { pfaExtractor } from './france/PFAExtractor';

const extractors: BaseExtractor[] = [kbaExtractor, pfaExtractor];

export default extractors;
