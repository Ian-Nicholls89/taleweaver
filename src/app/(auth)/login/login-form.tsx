'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { apiFetch } from '@/lib/client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/auth/login', { method: 'POST', json: { username: form.get('username'), password: form.get('password') } });
      router.replace('/play');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <Label>Username</Label>
          <Input name="username" autoComplete="username" required autoFocus />
        </label>
        <label className="block">
          <Label>Password</Label>
          <Input name="password" type="password" autoComplete="current-password" required />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Opening the door…' : 'Sign in'}
        </Button>
        <p className="text-center text-xs text-parchment-dim">New here? You need an invite link from the admin.</p>
      </form>
    </Card>
  );
}
