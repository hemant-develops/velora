import Link from "next/link";
import { PLAY_STORE_URL } from "@/lib/constants";

export const SiteFooter: React.FC = () => (
  <footer className="border-t border-neutral-200 bg-neutral-50">
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
      <div>
        <p className="text-lg font-extrabold tracking-tight text-neutral-900">
          VELORA
        </p>
        <p className="mt-2 max-w-xs text-sm text-neutral-500">
          Discover rental cars listed by real owners near you. Booking and
          contacting an owner happens in the VELORA app.
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-neutral-700">Explore</p>
        <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-500">
          <Link href="/search" className="hover:text-neutral-900">
            Browse Cars
          </Link>
          <Link
            href="/login?redirect=/account"
            className="hover:text-neutral-900"
          >
            Become a Car Owner
          </Link>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-neutral-700">Get the App</p>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          Get it on Google Play
        </a>
      </div>
    </div>

    <div className="border-t border-neutral-200 px-4 py-4 text-center text-xs text-neutral-400 sm:px-6">
      © {new Date().getFullYear()} VELORA. All rights reserved.
    </div>
  </footer>
);
