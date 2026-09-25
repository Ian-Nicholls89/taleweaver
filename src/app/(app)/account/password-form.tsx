'use client';

import { useState } from 'react';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { apiFetch } from '@/lib/client';

export function PasswordForm() {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    if (form.get('next') !== form.get('confirm')) return setError('The new passwords do not match.');
    setBusy(true);
    setError('');
    setDone(false);
    try {
      await apiFetch('/api/me/password', { method: 'POST', json: { current: form.get('current'), next: form.get('next') } });
      setDone(true);
      formEl.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="mb-3 font-display text-lg">Change password</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <Label>Current password</Label>
          <Input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className="block">
          <Label hint="at least 10 characters">New password</Label>
          <Input name="next" type="password" autoComplete="new-password" required minLength={10} />
        </label>
        <label className="block">
          <Label>Confirm new password</Label>
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
        </label>
        <ErrorText>{error}</ErrorText>
        {done && <p className="text-sm text-green-300">Password changed. Other devices have been signed out.</p>}
        <Button type="submit" disabled={busy}>
          Change password
        </Button>
      </form>
    </Card>
  );
}
