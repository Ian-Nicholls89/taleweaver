import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/play');
  return <LoginForm />;
}
