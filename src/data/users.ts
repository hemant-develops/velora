import { AppUser } from '../types';
import { avatars } from './images';

// NOTE: this list is dead demo data — nothing in the live app imports
// `demoUsers` (real users are created dynamically by AuthContext on
// signup/login and persisted to AsyncStorage). Kept only for reference and
// cleaned up here to match the app's real, Indian-market identity rather
// than leftover UAE placeholder content.
export const demoUsers: AppUser[] = [
  {
    id: 'owner-1',
    name: 'Rohan Mehta',
    email: 'owner1@velora.com',
    phone: '+91 98765 43210',
    location: 'Mumbai, Maharashtra',
    avatar: avatars.male1,
    role: 'owner',
  },
  {
    id: 'owner-2',
    name: 'Ananya Sharma',
    email: 'owner2@velora.com',
    phone: '+91 91234 56789',
    location: 'Jaipur, Rajasthan',
    avatar: avatars.female1,
    role: 'owner',
  },
];
