export const SiteFooter: React.FC = () => (
  <footer className="border-t border-neutral-200 bg-neutral-50">
    <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-neutral-500 sm:px-6">
      <p className="font-semibold text-neutral-700">VELORA</p>
      <p className="mt-1 max-w-xl">
        VELORA helps you discover rental cars listed by real owners near you. Booking and contacting an owner happens in the
        VELORA app.
      </p>
      <p className="mt-4">© {new Date().getFullYear()} VELORA. All rights reserved.</p>
    </div>
  </footer>
);
