export const formatCurrency = (value: number): string =>
  `₹${Math.round(value).toLocaleString('en-IN')}`;

export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const daysBetween = (startIso: string, endIso: string): number => {
  const start = new Date(startIso).setHours(0, 0, 0, 0);
  const end = new Date(endIso).setHours(0, 0, 0, 0);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
};

export const generateId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const generateBookingId = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `VLR-${y}${m}${d}-${suffix}`;
};

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// VELORA's phone fields target Indian mobile numbers: 10 digits starting
// with 6-9, optionally written with a "+91", "91" or leading "0" prefix and
// with spaces/hyphens for readability (e.g. "+91 98765 43210",
// "098765-43210", "9876543210" are all accepted).
export const isValidIndianPhone = (phone: string): boolean => {
  const digitsOnly = phone.replace(/[\s-]/g, '');
  const normalized = digitsOnly.replace(/^\+?91/, '').replace(/^0/, '');
  return /^[6-9]\d{9}$/.test(normalized);
};
