import { BaseTransformer } from '../lib';
import carRegistrationsByBrandTransformer from './car_registrations/by_brand/Transformer';

const transformers: BaseTransformer[] = [carRegistrationsByBrandTransformer];

export default transformers;
