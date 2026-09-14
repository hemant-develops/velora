import { redirect } from 'next/navigation';

// No content of its own -- middleware already sends a signed-out visitor to
// /login, so anyone reaching "/" is either about to be redirected there or
// is already signed in, in which case /dashboard is the right landing spot.
export default function RootPage() {
  redirect('/dashboard');
}
