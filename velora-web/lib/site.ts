// Falls back to localhost so `next dev`/a preview build never throws over a
// missing env var -- only sitemap.xml/robots.txt/canonical links use this,
// none of which block the site from working.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
