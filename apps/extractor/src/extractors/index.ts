import { BaseExtractor } from '../lib/BaseExtractor';
import { kbaExtractor } from './germany/KBAExtractor';
import { pfaExtractor } from './france/PFAExtractor';
import { unraeExtractor } from './italy/UNRAEExtractor';
import { ofvExtractor } from './norway/OFVExtractor';

const extractors: BaseExtractor[] = [
  kbaExtractor,
  pfaExtractor,
  unraeExtractor,
  ofvExtractor,
];

export default extractors;
