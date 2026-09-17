import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves every relative `alternates.canonical`/OG image url (e.g. the
  // car page's `/cars/...` canonical) against this site's real public URL
  // instead of Next.js's own "http://localhost:3000" default, which would
  // otherwise ship broken canonical/OG urls to production.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "VELORA — Rent Cars from Real Owners Near You",
    template: "%s | VELORA",
  },
  description:
    "Search and discover rental cars listed by real owners near you on VELORA. Compare price, seats, features and ratings, then continue your booking in the VELORA app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
