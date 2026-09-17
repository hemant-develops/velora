<<<<<<< HEAD
import { SearchForm } from "@/components/SearchForm";
=======
import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { PLAY_STORE_URL } from "@/lib/constants";
>>>>>>> claude/velora-git-supabase-workflow-550a70

const STEPS = [
  { title: "Search", body: "Tell us the car, city, seats or budget you need." },
  { title: "Compare", body: "Browse real listings from real owners near you." },
  { title: "Connect", body: "Continue in the VELORA app to contact the owner and book." },
];

export default function HomePage() {
  return (
    <div>
      <section className="bg-gradient-to-b from-amber-50 to-neutral-50 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
            Find your next rental car,
            <br className="hidden sm:block" /> listed by real owners near you
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-neutral-600 sm:text-lg">
            Search by car, brand, seats, budget or location — VELORA connects you directly with car owners in your city.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-4xl">
          <SearchForm />
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-neutral-900">How VELORA works</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-2xl bg-white p-6 text-center ring-1 ring-black/5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                {i + 1}
              </div>
              <h3 className="mt-3 text-base font-semibold text-neutral-900">{step.title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
<<<<<<< HEAD
=======

      <section className="bg-neutral-900 px-4 py-14 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Booking happens in the VELORA app</h2>
          <p className="max-w-xl text-sm text-neutral-300 sm:text-base">
            Message the owner, get instant updates and complete your booking — all inside the free VELORA app.
          </p>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition-transform hover:scale-[1.03]"
          >
            Download the VELORA App
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6">
        <h2 className="text-2xl font-bold text-neutral-900">Have a car sitting idle?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-neutral-600">
          Subscribe as a VELORA Car Owner to get your own store page, discoverable in search and on Google.
        </p>
        <Link
          href="/login?redirect=/account"
          className="mt-5 inline-block rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-amber-500"
        >
          Become a Car Owner
        </Link>
      </section>
>>>>>>> claude/velora-git-supabase-workflow-550a70
    </div>
  );
}
