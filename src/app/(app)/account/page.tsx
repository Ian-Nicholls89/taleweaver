import { requireUser } from '@/server/auth/current';
import { Attribution } from '@/components/attribution';
import { Card } from '@/components/ui';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl">Your account</h1>
      <Card>
        <p className="text-sm text-parchment-dim">Signed in as</p>
        <p className="font-display text-xl">{user.username}</p>
        <p className="mt-1 text-sm capitalize text-parchment-dim">{user.role}</p>
      </Card>
      <PasswordForm />
      <Attribution />
    </main>
  );
}
