import { AppUser } from '../types';

export interface ProfileCompleteness {
  isComplete: boolean;
  filled: number;
  total: number;
  missingFields: string[];
}

// A lightweight, honest "did they finish filling in their profile" check --
// this is NOT identity/KYC verification. That's a separate, real thing
// already tracked on `AppUser.ownerVerification` and shown as a "Verified
// Owner" badge only once an owner actually completes that flow. This check
// only looks at the fields a person can edit from Edit Profile, so a
// "Profile Complete" badge never implies more trust than the app actually
// establishes -- it just means the profile isn't half-empty.
export const getProfileCompleteness = (user: AppUser): ProfileCompleteness => {
  const checks: { label: string; done: boolean }[] = [
    { label: 'Name', done: !!user.name.trim() },
    { label: 'Phone number', done: !!user.phone?.trim() },
    { label: 'Location', done: !!user.location?.trim() },
    { label: 'Profile photo', done: !!user.avatar?.trim() },
  ];
  // Bio is only ever editable for owner accounts today (see
  // EditProfileScreen) -- requiring it from a renter would demand a field
  // they have no way to fill in.
  if (user.role === 'owner') {
    checks.push({ label: 'About you', done: !!user.bio?.trim() });
  }
  const missingFields = checks.filter((c) => !c.done).map((c) => c.label);
  return { isComplete: missingFields.length === 0, filled: checks.length - missingFields.length, total: checks.length, missingFields };
};
