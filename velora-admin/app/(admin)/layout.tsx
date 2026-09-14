import { requireAdmin } from '@/lib/admin';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';

// Every route under app/(admin)/ shares this layout, and every request to
// one of those routes runs requireAdmin() first — a signed-out visitor or a
// signed-in non-admin never reaches the sidebar/nav/any page content at
// all; requireAdmin() redirects before this returns anything. See
// lib/admin.ts for what actually enforces that (is_admin() over RLS, not a
// client-side flag).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar email={email} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
