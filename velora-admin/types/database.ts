// Hand-written row types mirroring the columns this admin website actually
// reads/writes, confirmed against the mobile app's own Supabase usage
// (src/context/CarsContext.tsx, src/context/BookingsContext.tsx,
// src/context/AuthContext.tsx) rather than guessed. Deliberately NOT a
// full generated schema — Phase 1 only touches these four tables/views, so
// only their real, confirmed columns are declared here.

export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'customer' | 'owner' | string | null;
  created_at?: string | null;
}

export interface CarListingRow {
  id: string;
  owner_id: string;
  name: string;
  brand_id: string;
  category: string;
  price_per_day: number;
  is_active: boolean;
  quantity: number;
  created_at: string;
}

export type BookingStatus = 'pending' | 'upcoming' | 'active' | 'completed' | 'cancelled' | 'rejected';

export interface BookingRow {
  id: string;
  car_id: string;
  renter_id: string;
  owner_id: string;
  status: BookingStatus;
  total: number;
  created_at: string;
}

// New in this phase — see supabase/migrations/0001_admin_foundation.sql.
export interface AdminAuditLogRow {
  id: string;
  admin_id: string;
  admin_email?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}
