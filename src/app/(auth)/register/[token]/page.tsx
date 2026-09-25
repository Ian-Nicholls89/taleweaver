import Link from 'next/link';
import { findUsableInvite } from '@/server/auth/invites';
import { Card } from '@/components/ui';
import { RegisterForm } from './register-form';

export const metadata = { title: 'Accept invite' };

export default async function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!findUsableInvite(token)) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-display text-xl">This invite has faded</p>
        <p className="text-sm text-parchment-dim">The link is invalid, expired, or already used. Ask the admin for a new one.</p>
        <Link href="/login" className="text-sm text-ember hover:underline">
          Back to sign in
        </Link>
      </Card>
    );
  }
  return <RegisterForm token={token} />;
}
