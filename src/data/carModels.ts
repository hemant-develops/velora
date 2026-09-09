// Popular model line-ups for each Indian-market brand in brands.ts. Used to
// drive the Model picker in Owner Add/Edit Car (a brand -> chip list of
// models, instead of a blank free-text field), and to compose a consistent
// "Brand Model" car name (e.g. "Maruti Suzuki Swift") when an owner taps
// one. A brand with no entry here (e.g. the pre-existing exotic/global
// brands) simply falls back to a free-text Model field — this list is a
// convenience, not a hard restriction on what an owner can list.
export const CAR_MODELS: Record<string, string[]> = {
  maruti: ['Swift', 'Baleno', 'Dzire', 'Brezza', 'Ertiga', 'WagonR', 'Fronx', 'Alto K10'],
  hyundai: ['i20', 'Creta', 'Venue', 'Verna', 'Exter', 'Aura'],
  tata: ['Nexon', 'Punch', 'Altroz', 'Tiago', 'Tigor', 'Harrier', 'Safari'],
  mahindra: ['Thar', 'XUV 3XO', 'XUV700', 'Scorpio-N', 'Bolero'],
  toyota: ['Glanza', 'Urban Cruiser Hyryder', 'Innova Crysta', 'Innova HyCross', 'Fortuner'],
  kia: ['Seltos', 'Sonet', 'Carens'],
  honda: ['City', 'Amaze', 'Elevate'],
  renault: ['Kwid', 'Triber', 'Kiger'],
  nissan: ['Magnite'],
  mg: ['Astor', 'Hector', 'Comet EV'],
  volkswagen: ['Virtus', 'Taigun'],
  skoda: ['Slavia', 'Kushaq'],
  jeep: ['Compass', 'Meridian'],
};

export const getModelsForBrand = (brandId: string): string[] => CAR_MODELS[brandId] ?? [];
