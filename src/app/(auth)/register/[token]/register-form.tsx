'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { apiFetch } from '@/lib/client';

export function RegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        json: { token, username: form.get('username'), password: form.get('password') },
      });
      router.replace('/play');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-parchment-dim">You have been invited. Choose a name and password to join.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <Label hint="3–32 letters, numbers, . - _">Username</Label>
          <Input name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+" autoFocus />
        </label>
        <label className="block">
          <Label hint="at least 10 characters">Password</Label>
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </label>
        <label className="block">
          <Label>Confirm password</Label>
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Signing the ledger…' : 'Create account'}
        </Button>
      </form>
    </Card>
  );
}
