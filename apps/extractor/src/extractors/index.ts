import { BaseExtractor } from '../lib/BaseExtractor';
import { kbaExtractor } from './germany/KBAExtractor';
import { pfaExtractor } from './france/PFAExtractor';
import { unraeExtractor } from './italy/UNRAEExtractor';

const extractors: BaseExtractor[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
];

export default extractors;
