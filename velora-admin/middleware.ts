import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export const middleware = async (request: NextRequest) => updateSession(request);

export const config = {
  matcher: [
    /*
     * Match every request except static assets, so the session cookie
     * stays fresh across normal navigation without re-running this on
     * every image/font/etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
