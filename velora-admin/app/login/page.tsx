import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';

// LoginForm reads the URL's ?error= param via useSearchParams(), which
// Next.js requires to be inside a Suspense boundary on a page that would
// otherwise be statically rendered.
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
