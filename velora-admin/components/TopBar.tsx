import { LogoutButton } from './LogoutButton';

export const TopBar = ({ email }: { email: string }) => (
  <header className="flex items-center justify-end border-b border-velora-border bg-white px-6 py-4">
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-velora-black/60 sm:inline">{email}</span>
      <LogoutButton />
    </div>
  </header>
);
