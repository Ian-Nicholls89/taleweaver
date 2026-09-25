'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ErrorText, Input, Select, Tag } from '@/components/ui';
import { apiFetch } from '@/lib/client';

type Pitch = { id: string; title: string; blurb: string; level: string; length: string; tags: string[] };

export function AdventureGenerator({
  models,
  initialPitches,
  defaultModel,
}: {
  models: Array<{ id: string; label: string }>;
  initialPitches: Pitch[];
  defaultModel?: string;
}) {
  const router = useRouter();
  const [pitches, setPitches] = useState(initialPitches);
  const [model, setModel] = useState(models.find((m) => m.id === defaultModel)?.id ?? models[0]?.id ?? '');
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!models.length) return null;

  async function pitch() {
    setBusy('pitch');
    setError('');
    try {
      const res = await apiFetch<{ pitches: Pitch[] }>('/api/adventures/pitches', { method: 'POST', json: { modelKey: model, theme: theme || undefined } });
      setPitches(res.pitches);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function expand(id: string) {
    setBusy(id);
    setError('');
    try {
      const res = await apiFetch<{ id: string }>(`/api/adventures/pitches/${id}/expand`, { method: 'POST', json: { modelKey: model } });
      router.push(`/play/new/${res.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-md flex-1" placeholder="Optional theme — e.g. “pirates and a haunted lighthouse”" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={300} />
        <Select className="max-w-xs" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
        <Button onClick={pitch} disabled={!!busy}>
          {busy === 'pitch' ? 'Dreaming up tales…' : 'Pitch me three adventures'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {pitches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {pitches.map((p) => (
            <Card key={p.id} className="flex flex-col border-dashed">
              <h3 className="mb-2 font-display text-lg">{p.title}</h3>
              <p className="mb-3 flex-1 font-story text-sm leading-relaxed text-parchment/90">{p.blurb}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Tag tone="ember">Level {p.level}</Tag>
                <Tag>{p.length}</Tag>
                {p.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              <Button variant="secondary" onClick={() => expand(p.id)} disabled={!!busy}>
                {busy === p.id ? 'Writing the adventure… (up to a minute)' : 'Write this one'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
