import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';

// Completes the Google OAuth redirect started by LoginForm.onGoogleLogin --
// Supabase redirects back here with a `code` query param; exchanging it for
// a session is what actually signs the visitor in (and sets the session
// cookie middleware.ts then keeps fresh on every later request).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirect') || '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.redirect(`${origin}/login?error=config`);
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('VELORA_WEB_AUTH_CALLBACK_ERROR', error.message);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
