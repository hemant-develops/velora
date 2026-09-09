import { Brand } from '../types';
import { brandLogos } from './images';

// Indian-market rental catalog. The original list only had global/exotic
// brands (Tesla, Lamborghini, Ferrari, ...) with no everyday Indian OEMs —
// this adds the popular Indian-market manufacturers (see CAR_MODELS in
// carModels.ts for their model line-ups) so Velora's own sample/catalog
// data matches what a real Indian rental platform would list.
//
// The pre-existing entries are kept as-is rather than removed: an owner
// may already have listed a real car under one of those brand ids (e.g.
// 'bmw'), and dropping the brand here would leave that listing showing a
// raw id instead of a name (see CarsContext.brandNameOf's fallback).
export const brands: Brand[] = [
  { id: 'maruti', name: 'Maruti Suzuki', logo: brandLogos.maruti },
  { id: 'hyundai', name: 'Hyundai', logo: brandLogos.hyundai },
  { id: 'tata', name: 'Tata', logo: brandLogos.tata },
  { id: 'mahindra', name: 'Mahindra', logo: brandLogos.mahindra },
  { id: 'toyota', name: 'Toyota', logo: brandLogos.toyota },
  { id: 'kia', name: 'Kia', logo: brandLogos.kia },
  { id: 'honda', name: 'Honda', logo: brandLogos.honda },
  { id: 'renault', name: 'Renault', logo: brandLogos.renault },
  { id: 'nissan', name: 'Nissan', logo: brandLogos.nissan },
  { id: 'mg', name: 'MG', logo: brandLogos.mg },
  { id: 'volkswagen', name: 'Volkswagen', logo: brandLogos.volkswagen },
  { id: 'skoda', name: 'Skoda', logo: brandLogos.skoda },
  { id: 'jeep', name: 'Jeep', logo: brandLogos.jeep },
  { id: 'tesla', name: 'Tesla', logo: brandLogos.tesla },
  { id: 'bmw', name: 'BMW', logo: brandLogos.bmw },
  { id: 'lamborghini', name: 'Lamborghini', logo: brandLogos.lamborghini },
  { id: 'ferrari', name: 'Ferrari', logo: brandLogos.ferrari },
  { id: 'mercedes', name: 'Mercedes', logo: brandLogos.mercedes },
  { id: 'audi', name: 'Audi', logo: brandLogos.audi },
];
