import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// TYPE-FIX NOTE -- why setAll's parameter is annotated explicitly below:
// @supabase/ssr@0.5.2's createServerClient.d.ts imports SupabaseClientOptions
// from a deep, non-exported subpath of @supabase/supabase-js
// ("@supabase/supabase-js/dist/module/lib/types") that only existed in the
// supabase-js ~2.43.x layout this package was built against. The installed
// supabase-js is 2.116.0, whose dist/ was restructured (flat dist/index.*
// files, no dist/module/lib/*) -- that deep import can no longer resolve.
// With skipLibCheck:true (required for a normal Next.js build) TypeScript
// doesn't hard-error on that broken import inside the .d.ts; it silently
// widens the affected generic to `any`, which was cascading into this
// call site and making `cookiesToSet` (and its destructured fields)
// implicitly `any` here, even though the code itself was always correct.
// Explicitly typing the callback parameter against `CookieOptions` --
// which @supabase/ssr exports directly from its own ./types module and is
// NOT part of the broken import chain -- sidesteps that resolution failure
// without touching auth/session behavior or weakening `strict`.

// Runs on every request (see middleware.ts). Two jobs:
//  1. Keep the Supabase session cookie fresh (auto-refresh on the server
//     side, mirroring what the mobile app's AppState listener does for the
//     native client — see src/lib/supabase.ts in the main repo).
//  2. Gate every route under the admin area: no session -> /login. This is
//     a UX redirect, not the actual security boundary — the real boundary
//     is RLS (is_admin() + the admin-scoped policies). Even if this
//     middleware were somehow bypassed, an unauthorized session still
//     cannot read admin data, because the database itself refuses it.
export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Misconfigured deployment -- fail closed rather than silently letting
    // requests through with no session handling at all.
    return NextResponse.redirect(new URL('/login?error=config', request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = path === '/login' || path.startsWith('/_next') || path.startsWith('/api/health');

  if (!user && !isPublicPath) {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === '/login') {
    // Already signed in -- send straight to the dashboard instead of
    // showing the login form again. Admin-status is re-checked by the
    // (admin) layout itself on every request; this redirect is purely a
    // convenience for an already-authenticated visit to /login.
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
};
