import { and, desc, eq, ne } from 'drizzle-orm';
import { Attribution } from '@/components/attribution';
import { requireAdmin } from '@/server/auth/current';
import { getDb, schema } from '@/server/db';
import { listInvites } from '@/server/auth/invites';
import { keyStatus, listModels, usageSummary } from '@/server/llm/registry';
import { LLM_PROVIDERS, OTHER_KEY_PROVIDERS, mockEnabled } from '@/server/llm/providers';
import { getSetting } from '@/server/settings';
import { Card } from '@/components/ui';
import { AdventuresPanel, InvitesPanel, LimitsPanel, MediaPanel, ModelsPanel, ProvidersPanel, UsersPanel } from './panels';

export const metadata = { title: 'Admin' };

const SECTIONS = [
  ['people', 'Users & invites'],
  ['ai', 'AI models'],
  ['media', 'Images & voice'],
  ['adventures', 'Adventures'],
  ['usage', 'Usage & limits'],
] as const;

export default async function AdminPage() {
  const me = await requireAdmin();
  const db = getDb();
  const users = db
    .select({ id: schema.users.id, username: schema.users.username, role: schema.users.role, disabled: schema.users.disabled, createdAt: schema.users.createdAt })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();
  const models = listModels();
  const enabledModels = models.filter((m) => m.enabled).map((m) => ({ id: m.id, label: `${m.label} — ${m.providerLabel}` }));
  const adventures = db
    .select({ id: schema.adventures.id, title: schema.adventures.title, source: schema.adventures.source, visibility: schema.adventures.visibility, ownerId: schema.adventures.ownerId })
    .from(schema.adventures)
    .where(and(ne(schema.adventures.source, 'bundled'), eq(schema.adventures.status, 'ready')))
    .orderBy(desc(schema.adventures.createdAt))
    .all();
  const usernames = Object.fromEntries(users.map((u) => [u.id, u.username]));

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[180px_1fr]">
      <nav className="top-20 hidden h-fit space-y-1 text-sm lg:sticky lg:block">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="block rounded-md px-3 py-1.5 text-parchment-dim hover:bg-ink-800 hover:text-parchment">
            {label}
          </a>
        ))}
      </nav>
      <div className="min-w-0 space-y-10">
        <section id="people" className="scroll-mt-20 space-y-4">
          <h2 className="font-display text-2xl">Users & invites</h2>
          <InvitesPanel invites={listInvites()} />
          <UsersPanel users={users} meId={me.id} />
        </section>

        <section id="ai" className="scroll-mt-20 space-y-4">
          <h2 className="font-display text-2xl">AI models</h2>
          <p className="text-sm text-parchment-dim">
            Add a key for any provider, fetch its model list, then enable the models players may choose as their Dungeon Master. Keys are encrypted at rest and never sent to browsers.
          </p>
          <ProvidersPanel
            status={keyStatus()}
            llm={Object.entries(LLM_PROVIDERS).map(([id, p]) => ({
              id,
              label: p.label,
              keyUrl: p.keyUrl,
              note: p.note ?? null,
              credentialType: p.credentialType ?? 'apiKey',
              urlPlaceholder: p.urlPlaceholder ?? null,
            }))}
            other={Object.entries(OTHER_KEY_PROVIDERS).map(([id, p]) => ({ id, ...p }))}
            mock={mockEnabled()}
          />
          <ModelsPanel models={models.map((m) => ({ id: m.id, provider: m.provider, providerLabel: m.providerLabel, modelId: m.modelId, label: m.label, enabled: m.enabled, toolSupport: m.toolSupport, costHint: m.costHint }))} />
        </section>

        <section id="media" className="scroll-mt-20 space-y-4">
          <h2 className="font-display text-2xl">Scene images & narration</h2>
          <MediaPanel image={getSetting('image')} tts={getSetting('tts')} />
        </section>

        <section id="adventures" className="scroll-mt-20 space-y-4">
          <h2 className="font-display text-2xl">Adventures</h2>
          <AdventuresPanel adventures={adventures.map((a) => ({ ...a, ownerName: a.ownerId ? (usernames[a.ownerId] ?? '?') : null }))} users={users.map((u) => ({ id: u.id, username: u.username }))} models={enabledModels} />
        </section>

        <section id="usage" className="scroll-mt-20 space-y-4">
          <h2 className="font-display text-2xl">Usage & limits</h2>
          <LimitsPanel limits={getSetting('limits')} models={enabledModels} />
          <Card>
            <p className="mb-3 font-display text-lg">Last 30 days</p>
            <UsageTable rows={usageSummary()} />
          </Card>
        </section>
      </div>
      <Attribution className="lg:col-span-2" />
    </main>
  );
}

function UsageTable({ rows }: { rows: Array<{ username: string | null; modelKey: string; inputTokens: number; outputTokens: number; calls: number }> }) {
  if (!rows.length) return <p className="text-sm text-parchment-dim">No AI calls yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-parchment-dim">
          <tr>
            <th className="py-1 pr-4">Player</th>
            <th className="py-1 pr-4">Model</th>
            <th className="py-1 pr-4 text-right">Calls</th>
            <th className="py-1 pr-4 text-right">Input tokens</th>
            <th className="py-1 text-right">Output tokens</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-ink-800">
              <td className="py-1.5 pr-4">{r.username ?? '(deleted)'}</td>
              <td className="py-1.5 pr-4 font-mono text-xs">{r.modelKey}</td>
              <td className="py-1.5 pr-4 text-right">{r.calls}</td>
              <td className="py-1.5 pr-4 text-right">{r.inputTokens.toLocaleString()}</td>
              <td className="py-1.5 text-right">{r.outputTokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
