import { BaseExtractor } from '../lib/BaseExtractor';
import { kbaExtractor } from './germany/KBAExtractor';

const extractors: BaseExtractor[] = [kbaExtractor];

export default extractors;
