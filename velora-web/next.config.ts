import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives inside a monorepo alongside the (unrelated) mobile
  // app's own package-lock.json -- without this, Next.js guesses the wrong
  // workspace root from that sibling lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    // Car photos and avatars are real Supabase Storage public URLs
    // (see the mobile app's src/utils/uploadImage.ts -- same buckets,
    // same project). Unsplash-hosted placeholder images (brand logos with
    // no admin-uploaded logo yet) also need to be allowed for the same
    // reason CatalogContext falls back to one on the mobile app.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
