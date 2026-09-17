export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export const formatDistanceKm = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`);
