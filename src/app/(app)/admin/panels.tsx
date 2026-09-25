'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ErrorText, Input, Label, Select, Tag, Textarea } from '@/components/ui';
import { apiFetch, timeAgo } from '@/lib/client';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function run(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      if (success) setNotice(success);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, notice, run };
}

function Notice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg border border-verdant/40 bg-verdant/10 px-3 py-2 text-sm text-green-200">{children}</p>;
}

// ---------------- invites ----------------

type Invite = { id: string; note: string | null; createdAt: number; expiresAt: number; usedAt: number | null; revokedAt: number | null; usedByName: string | null };

export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const { busy, error, run } = useAction();
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const now = Date.now();
  const stateOf = (i: Invite) => (i.usedAt ? `used by ${i.usedByName ?? '?'}` : i.revokedAt ? 'revoked' : i.expiresAt < now ? 'expired' : 'open');

  return (
    <Card>
      <p className="mb-1 font-display text-lg">Invite a player</p>
      <p className="mb-3 text-sm text-parchment-dim">Registration only works through a single-use invite link. Send the link privately.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1">
          <Label>Note (who is it for?)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Sam from work" />
        </label>
        <label>
          <Label>Expires in</Label>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} day{d > 1 ? 's' : ''}
              </option>
            ))}
          </Select>
        </label>
        <Button
          disabled={busy === 'create'}
          onClick={() =>
            run('create', async () => {
              const res = await apiFetch<{ url: string }>('/api/admin/invites', { method: 'POST', json: { note: note || undefined, days } });
              setCreated(res.url);
              setCopied(false);
              setNote('');
            })
          }
        >
          Create invite link
        </Button>
      </div>
      {created && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ember/50 bg-ember/5 p-3">
          <code className="min-w-0 flex-1 break-all text-sm text-ember-bright" data-testid="invite-url">
            {created}
          </code>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(created);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <p className="w-full text-xs text-parchment-dim">This link is shown only once.</p>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {invites.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-800 text-sm">
          {invites.slice(0, 20).map((i) => {
            const s = stateOf(i);
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">
                  {i.note || <span className="text-parchment-dim">(no note)</span>} <span className="text-xs text-parchment-dim">· created {timeAgo(i.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Tag tone={s === 'open' ? 'ember' : 'default'}>{s}</Tag>
                  {s === 'open' && (
                    <Button variant="ghost" className="!px-2 !py-0.5 text-xs" disabled={!!busy} onClick={() => run(i.id, () => apiFetch(`/api/admin/invites/${i.id}`, { method: 'DELETE' }))}>
                      Revoke
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------- users ----------------

type User = { id: string; username: string; role: 'admin' | 'player'; disabled: boolean; createdAt: number };

export function UsersPanel({ users, meId }: { users: User[]; meId: string }) {
  const { busy, error, notice, run } = useAction();
  const patch = (id: string, body: object, success?: string) => run(id, () => apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', json: body }), success);

  return (
    <Card>
      <p className="mb-3 font-display text-lg">Accounts</p>
      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>
      <ul className="divide-y divide-ink-800 text-sm">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className={`mr-auto ${u.disabled ? 'line-through opacity-60' : ''}`}>
              {u.username} {u.id === meId && <span className="text-xs text-parchment-dim">(you)</span>}
            </span>
            <Tag tone={u.role === 'admin' ? 'ember' : 'default'}>{u.role}</Tag>
            {u.id !== meId && (
              <>
                <Button variant="ghost" className="!px-2 !py-0.5 text-xs" disabled={!!busy} onClick={() => patch(u.id, { role: u.role === 'admin' ? 'player' : 'admin' })}>
                  {u.role === 'admin' ? 'Make player' : 'Make admin'}
                </Button>
                <Button variant="ghost" className="!px-2 !py-0.5 text-xs" disabled={!!busy} onClick={() => patch(u.id, { disabled: !u.disabled })}>
                  {u.disabled ? 'Enable' : 'Disable'}
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2 !py-0.5 text-xs"
                  disabled={!!busy}
                  onClick={() => {
                    const pw = prompt(`New password for ${u.username} (min 10 characters):`);
                    if (pw) patch(u.id, { password: pw }, `Password for ${u.username} changed; they have been signed out.`);
                  }}
                >
                  Reset password
                </Button>
                <Button
                  variant="danger"
                  className="!px-2 !py-0.5 text-xs"
                  disabled={!!busy}
                  onClick={() => confirm(`Delete ${u.username} and all their games?`) && run(u.id, () => apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' }))}
                >
                  Delete
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------- providers ----------------

type ProviderInfo = { id: string; label: string; keyUrl: string; note: string | null };

export function ProvidersPanel({
  status,
  llm,
  other,
  mock,
}: {
  status: Record<string, { set: boolean; hint: string; updatedAt: number }>;
  llm: ProviderInfo[];
  other: Array<{ id: string; label: string; keyUrl: string; usedFor: string }>;
  mock: boolean;
}) {
  const { busy, error, notice, run } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [key, setKey] = useState('');

  const row = (p: { id: string; label: string; keyUrl: string; note?: string | null; usedFor?: string }, isLlm: boolean) => {
    const s = status[p.id];
    return (
      <li key={p.id} className="py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto">
            {p.label}
            {p.usedFor && <span className="ml-2 text-xs text-parchment-dim">{p.usedFor}</span>}
          </span>
          {s ? <Tag tone="ember">key {s.hint}</Tag> : <Tag>no key</Tag>}
          <Button variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => (setEditing(editing === p.id ? null : p.id), setKey(''))}>
            {s ? 'Replace key' : 'Add key'}
          </Button>
          {s && isLlm && (
            <Button
              variant="secondary"
              className="!px-2 !py-0.5 text-xs"
              disabled={!!busy}
              onClick={() => run(`refresh-${p.id}`, async () => {
                const r = await apiFetch<{ count: number }>(`/api/admin/providers/${p.id}/refresh`, { method: 'POST' });
                return r;
              }, `Fetched ${p.label} models. Enable the ones you want below.`)}
            >
              {busy === `refresh-${p.id}` ? 'Fetching…' : 'Fetch models'}
            </Button>
          )}
          {s && (
            <Button variant="ghost" className="!px-2 !py-0.5 text-xs" disabled={!!busy} onClick={() => confirm(`Remove the ${p.label} key? Its models will be disabled.`) && run(p.id, () => apiFetch(`/api/admin/providers/${p.id}`, { method: 'DELETE' }))}>
              Remove
            </Button>
          )}
        </div>
        {p.note && <p className="mt-1 text-xs text-amber-300/80">{p.note}</p>}
        {editing === p.id && (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(p.id, async () => {
                await apiFetch(`/api/admin/providers/${p.id}`, { method: 'PUT', json: { apiKey: key } });
                setEditing(null);
                setKey('');
              }, `${p.label} key saved.${isLlm ? ' Now fetch its models.' : ''}`);
            }}
          >
            <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste API key" className="max-w-md flex-1" />
            <Button type="submit" disabled={key.length < 8 || !!busy}>
              Save
            </Button>
            {p.keyUrl && (
              <a href={p.keyUrl} target="_blank" rel="noreferrer" className="self-center text-xs text-ember hover:underline">
                Get a key ↗
              </a>
            )}
          </form>
        )}
      </li>
    );
  };

  return (
    <Card>
      <p className="mb-1 font-display text-lg">Provider keys</p>
      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>
      <ul className="divide-y divide-ink-800 text-sm">{llm.map((p) => row(p, true))}</ul>
      <p className="mb-1 mt-5 text-xs uppercase tracking-wider text-parchment-dim">Other services</p>
      <ul className="divide-y divide-ink-800 text-sm">{other.map((p) => row(p, false))}</ul>
      {mock && <p className="mt-3 text-xs text-amber-300/80">The scripted mock DM is enabled (TALEWEAVER_ENABLE_MOCK). Turn it off in production.</p>}
    </Card>
  );
}

// ---------------- models ----------------

type ModelRow = { id: string; provider: string; providerLabel: string; modelId: string; label: string; enabled: boolean; toolSupport: boolean; costHint: string | null };

export function ModelsPanel({ models }: { models: ModelRow[] }) {
  const { busy, error, run } = useAction();
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return models.filter((m) => (showAll || m.enabled || f) && (!f || `${m.label} ${m.modelId} ${m.providerLabel}`.toLowerCase().includes(f)));
  }, [models, filter, showAll]);
  const update = (id: string, patch: object) => run(id, () => apiFetch('/api/admin/models', { method: 'PATCH', json: { id, ...patch } }));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto font-display text-lg">Models</p>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search models…" className="!w-64 !py-1 text-sm" />
        <label className="flex items-center gap-1.5 text-xs text-parchment-dim">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-ember" /> show disabled
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
      {models.length === 0 ? (
        <p className="text-sm text-parchment-dim">Add a provider key and press “Fetch models”.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-parchment-dim">No models enabled yet — tick “show disabled” or search to find some.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-parchment-dim">
              <tr>
                <th className="py-1 pr-3">On</th>
                <th className="py-1 pr-3">Name shown to players</th>
                <th className="py-1 pr-3">Provider / id</th>
                <th className="py-1 pr-3" title="Whether the model reliably calls tools (dice, HP, scenes)">Tools</th>
                <th className="py-1">Cost hint</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 200).map((m) => (
                <tr key={m.id} className="border-t border-ink-800">
                  <td className="py-1.5 pr-3">
                    <input type="checkbox" checked={m.enabled} disabled={busy === m.id} onChange={(e) => update(m.id, { enabled: e.target.checked })} className="accent-ember" aria-label={`Enable ${m.label}`} />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      defaultValue={m.label}
                      onBlur={(e) => e.target.value !== m.label && e.target.value.trim() && update(m.id, { label: e.target.value.trim() })}
                      className="w-full min-w-40 rounded border border-transparent bg-transparent px-1 hover:border-ink-600 focus:border-ember focus:outline-none"
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-parchment-dim">
                    {m.providerLabel} · <span className="font-mono">{m.modelId}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="checkbox" checked={m.toolSupport} onChange={(e) => update(m.id, { toolSupport: e.target.checked })} className="accent-ember" aria-label="Supports tools" />
                  </td>
                  <td className="py-1.5">
                    <input
                      defaultValue={m.costHint ?? ''}
                      placeholder="e.g. $$"
                      maxLength={60}
                      onBlur={(e) => e.target.value !== (m.costHint ?? '') && update(m.id, { costHint: e.target.value || null })}
                      className="w-24 rounded border border-transparent bg-transparent px-1 hover:border-ink-600 focus:border-ember focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 200 && <p className="mt-2 text-xs text-parchment-dim">Showing 200 of {shown.length}; search to narrow down.</p>}
        </div>
      )}
    </Card>
  );
}

// ---------------- images & narration ----------------

type ImageSettings = { provider: string; model: string; baseUrl: string; style: string; comfyWorkflow: string };
type TtsSettings = { provider: string; voice: string; model: string };

const IMAGE_PROVIDERS: Record<string, { label: string; help: string; modelPlaceholder?: string; needsUrl?: boolean }> = {
  none: { label: 'No images', help: 'Theatre of the mind only.' },
  openai: { label: 'OpenAI (gpt-image)', help: 'Uses the OpenAI key above. About $0.02–0.07 per image.', modelPlaceholder: 'gpt-image-1' },
  replicate: { label: 'Replicate (FLUX etc.)', help: 'Needs a Replicate key. FLUX schnell is fast and cheap (~$0.003/image).', modelPlaceholder: 'black-forest-labs/flux-schnell' },
  stability: { label: 'Stability AI', help: 'Needs a Stability key. Uses Stable Image Core.' },
  a1111: { label: 'Local: Automatic1111 / Forge', help: 'Your own GPU. Start the WebUI with --api and enter its URL.', needsUrl: true },
  comfyui: { label: 'Local: ComfyUI', help: 'Your own GPU. Paste an API-format workflow containing %PROMPT% where the prompt goes.', needsUrl: true },
  mock: { label: 'Placeholder (testing)', help: 'Draws a simple placeholder card. No cost.' },
};

export function MediaPanel({ image, tts }: { image: ImageSettings; tts: TtsSettings }) {
  const { busy, error, notice, run } = useAction();
  const [img, setImg] = useState(image);
  const [voice, setVoice] = useState(tts);
  const p = IMAGE_PROVIDERS[img.provider] ?? IMAGE_PROVIDERS.none!;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <p className="mb-3 font-display text-lg">Scene images</p>
        <div className="space-y-3">
          <label className="block">
            <Label>Image generator</Label>
            <Select value={img.provider} onChange={(e) => setImg({ ...img, provider: e.target.value })}>
              {Object.entries(IMAGE_PROVIDERS).map(([id, x]) => (
                <option key={id} value={id}>
                  {x.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-parchment-dim">{p.help}</p>
          </label>
          {p.modelPlaceholder && (
            <label className="block">
              <Label hint="optional">Model</Label>
              <Input value={img.model} onChange={(e) => setImg({ ...img, model: e.target.value })} placeholder={p.modelPlaceholder} />
            </label>
          )}
          {p.needsUrl && (
            <label className="block">
              <Label>Server URL</Label>
              <Input value={img.baseUrl} onChange={(e) => setImg({ ...img, baseUrl: e.target.value })} placeholder="http://192.168.1.50:7860" />
            </label>
          )}
          {img.provider === 'comfyui' && (
            <label className="block">
              <Label>Workflow (API format JSON)</Label>
              <Textarea rows={5} value={img.comfyWorkflow} onChange={(e) => setImg({ ...img, comfyWorkflow: e.target.value })} className="font-mono text-xs" />
            </label>
          )}
          {img.provider !== 'none' && (
            <label className="block">
              <Label>Art style added to every prompt</Label>
              <Textarea rows={2} value={img.style} onChange={(e) => setImg({ ...img, style: e.target.value })} maxLength={500} />
            </label>
          )}
          <Button disabled={!!busy} onClick={() => run('image', () => apiFetch('/api/admin/settings', { method: 'PUT', json: { image: img } }), 'Image settings saved.')}>
            Save image settings
          </Button>
        </div>
      </Card>

      <Card>
        <p className="mb-3 font-display text-lg">Narration voice</p>
        <div className="space-y-3">
          <label className="block">
            <Label>Voice engine</Label>
            <Select value={voice.provider} onChange={(e) => setVoice({ ...voice, provider: e.target.value })}>
              <option value="browser">Browser voices (free, quality varies by device)</option>
              <option value="openai">OpenAI TTS (uses the OpenAI key)</option>
              <option value="elevenlabs">ElevenLabs (most natural; needs a key)</option>
            </Select>
          </label>
          {voice.provider !== 'browser' && (
            <>
              <label className="block">
                <Label hint={voice.provider === 'openai' ? 'e.g. onyx, fable, sage, ash' : 'ElevenLabs voice id'}>Voice</Label>
                <Input value={voice.voice} onChange={(e) => setVoice({ ...voice, voice: e.target.value })} placeholder={voice.provider === 'openai' ? 'onyx' : 'JBFqnCBsd6RMkjVDRZzb'} />
              </label>
              <label className="block">
                <Label hint="optional">Model</Label>
                <Input value={voice.model} onChange={(e) => setVoice({ ...voice, model: e.target.value })} placeholder={voice.provider === 'openai' ? 'gpt-4o-mini-tts' : 'eleven_multilingual_v2'} />
              </label>
            </>
          )}
          <p className="text-xs text-parchment-dim">Players switch narration on or off themselves on the game screen.</p>
          <Button disabled={!!busy} onClick={() => run('tts', () => apiFetch('/api/admin/settings', { method: 'PUT', json: { tts: voice } }), 'Voice settings saved.')}>
            Save voice settings
          </Button>
        </div>
      </Card>
      <div className="xl:col-span-2">
        <ErrorText>{error}</ErrorText>
        <Notice>{notice}</Notice>
      </div>
    </div>
  );
}

// ---------------- adventures ----------------

type AdvRow = { id: string; title: string; source: string; visibility: 'all' | 'owner' | string[]; ownerId: string | null; ownerName: string | null };

export function AdventuresPanel({ adventures, users, models }: { adventures: AdvRow[]; users: Array<{ id: string; username: string }>; models: Array<{ id: string; label: string }> }) {
  const { busy, error, notice, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState(models[0]?.id ?? '');
  const [shareAll, setShareAll] = useState(false);
  const [condense, setCondense] = useState(true);

  const visLabel = (v: AdvRow['visibility']) => (v === 'all' ? 'everyone' : v === 'owner' ? 'owner only' : `${v.length} player${v.length === 1 ? '' : 's'}`);

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-1 font-display text-lg">Import an adventure you own</p>
        <p className="mb-3 text-sm text-parchment-dim">
          Upload a PDF, Markdown or text file. The AI turns it into Dungeon Master notes for a single hero. Imports stay private on this server; only share them with players where the licence allows.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <Label>File</Label>
            <input type="file" accept=".pdf,.md,.markdown,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-ink-700 file:px-3 file:py-1.5 file:text-parchment" />
          </label>
          <label className="min-w-60">
            <Label>Model for converting</Label>
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm text-parchment-dim">
            <input type="checkbox" checked={shareAll} onChange={(e) => setShareAll(e.target.checked)} className="accent-ember" /> visible to all players
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm text-parchment-dim" title="Untick to import Taleweaver-format Markdown (with frontmatter) as-is">
            <input type="checkbox" checked={condense} onChange={(e) => setCondense(e.target.checked)} className="accent-ember" /> convert with AI
          </label>
          <Button
            disabled={!file || (!model && condense) || !!busy}
            onClick={() =>
              run(
                'import',
                async () => {
                  const form = new FormData();
                  form.set('file', file!);
                  form.set('modelKey', model);
                  form.set('visibility', shareAll ? 'all' : 'owner');
                  form.set('condense', String(condense));
                  const res = await fetch('/api/admin/adventures/import', { method: 'POST', body: form });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                },
                'Imported! It now appears in the adventure list.',
              )
            }
          >
            {busy === 'import' ? 'Reading and converting… (can take a few minutes)' : 'Import'}
          </Button>
        </div>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
          <Notice>{notice}</Notice>
        </div>
      </Card>

      {adventures.length > 0 && (
        <Card>
          <p className="mb-3 font-display text-lg">Imported & AI-crafted adventures</p>
          <ul className="divide-y divide-ink-800 text-sm">
            {adventures.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="mr-auto">
                  {a.title} <span className="text-xs text-parchment-dim">· {a.source} by {a.ownerName ?? '—'}</span>
                </span>
                <span className="text-xs text-parchment-dim">Visible to {visLabel(a.visibility)}</span>
                <Select
                  className="!w-auto !py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const visibility = v === 'all' || v === 'owner' ? v : Array.from(new Set([...(Array.isArray(a.visibility) ? a.visibility : []), v]));
                    run(a.id, () => apiFetch(`/api/admin/adventures/${a.id}`, { method: 'PATCH', json: { visibility } }));
                  }}
                >
                  <option value="">Change…</option>
                  <option value="all">Everyone</option>
                  <option value="owner">Owner only</option>
                  {users
                    .filter((u) => u.id !== a.ownerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        + {u.username}
                      </option>
                    ))}
                </Select>
                <Button variant="danger" className="!px-2 !py-0.5 text-xs" disabled={!!busy} onClick={() => confirm(`Delete "${a.title}"? Games using it are deleted too.`) && run(a.id, () => apiFetch(`/api/adventures/${a.id}`, { method: 'DELETE' }))}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------- limits ----------------

export function LimitsPanel({ limits, models }: { limits: { dailyTokenCap: number | null; summarizerModel: string | null }; models: Array<{ id: string; label: string }> }) {
  const { busy, error, notice, run } = useAction();
  const [cap, setCap] = useState(limits.dailyTokenCap ? String(limits.dailyTokenCap) : '');
  const [summ, setSumm] = useState(limits.summarizerModel ?? '');
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label hint="per player, rolling 24 h; blank = unlimited; admins exempt">Daily token cap</Label>
          <Input type="number" min={0} step={10000} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="e.g. 500000" />
        </label>
        <label className="block">
          <Label hint="a cheaper model saves money on long games">Model for story summaries</Label>
          <Select value={summ} onChange={(e) => setSumm(e.target.value)}>
            <option value="">Same as the game’s DM</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button
          disabled={!!busy}
          onClick={() =>
            run('limits', () => apiFetch('/api/admin/settings', { method: 'PUT', json: { limits: { dailyTokenCap: cap ? Math.max(0, parseInt(cap, 10)) : null, summarizerModel: summ || null } } }), 'Limits saved.')
          }
        >
          Save
        </Button>
        <ErrorText>{error}</ErrorText>
        <Notice>{notice}</Notice>
      </div>
    </Card>
  );
}
