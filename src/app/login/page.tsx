import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/server';
import { LoginView } from '@/components/app/login-view';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const target = params.next && params.next.startsWith('/') ? params.next : '/dashboard';
  const user = await currentUser();
  if (user) redirect(target);
  return <LoginView next={target} />;
}
