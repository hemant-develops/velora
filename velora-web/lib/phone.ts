// Same E.164-for-India normalization as the mobile app's src/utils/format.ts
// (toE164IndianPhone) -- kept as its own small copy here for the same reason
// lib/geo.ts is: this is a separate deployable project, and the logic is
// simple enough that duplicating it beats coupling two unrelated build
// pipelines together.
export const isValidIndianPhone = (phone: string): boolean => {
  const digitsOnly = phone.replace(/[\s-]/g, '').replace(/^\+?91/, '').replace(/^0/, '');
  return /^[6-9]\d{9}$/.test(digitsOnly);
};

export const toE164IndianPhone = (phone: string): string | null => {
  if (!isValidIndianPhone(phone)) return null;
  const digitsOnly = phone.replace(/[\s-]/g, '');
  const normalized = digitsOnly.replace(/^\+?91/, '').replace(/^0/, '');
  return `+91${normalized}`;
};

export const isValidOtp = (otp: string): boolean => /^\d{6}$/.test(otp.trim());
