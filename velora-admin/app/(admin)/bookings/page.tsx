import { requireAdmin } from '@/lib/admin';
import { BookingsTable, type BookingRow } from '@/components/BookingsTable';
import { LiveBadge } from '@/components/LiveBadge';

interface RawBooking {
  id: string;
  car_id: string;
  renter_name: string | null;
  status: string;
  payment_status: string;
  pickup_date: string;
  dropoff_date: string;
  total: number;
  created_at: string;
}

export default async function BookingsPage() {
  const { supabase } = await requireAdmin();

  // Both already covered by existing RLS (bookings_select_admin,
  // car_listings_select_admin) -- no new migration needed for this section.
  // renter_name is a snapshot column already ON bookings (see
  // supabase_migration_multidevice.sql) -- taken at booking time, so no
  // profiles join is needed just to show who booked.
  const [{ data: bookingRows, error }, { data: carRows }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, car_id, renter_name, status, payment_status, pickup_date, dropoff_date, total, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('car_listings').select('id, name'),
  ]);

  const carNameById = new Map<string, string>();
  for (const c of (carRows ?? []) as { id: string; name: string }[]) {
    carNameById.set(c.id, c.name);
  }

  const rows: BookingRow[] = ((bookingRows ?? []) as RawBooking[]).map((b) => ({
    id: b.id,
    carName: carNameById.get(b.car_id) ?? 'Deleted listing',
    renterName: b.renter_name ?? 'Unknown',
    status: b.status,
    paymentStatus: b.payment_status,
    pickupDate: b.pickup_date,
    dropoffDate: b.dropoff_date,
    total: b.total,
    createdAt: b.created_at,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Bookings</h1>
        <LiveBadge tables={['bookings', 'car_listings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Most recent 200 bookings, newest first.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load bookings.
        </div>
      )}

      {!error && <BookingsTable rows={rows} />}
    </div>
  );
}
