import Link from 'next/link';
import { Attribution } from '@/components/attribution';
import { requireUser } from '@/server/auth/current';
import { listAdventures, listPitches } from '@/server/adventures';
import { listGames } from '@/server/dm/engine';
import { listModels } from '@/server/llm/registry';
import { Card, Tag } from '@/components/ui';
import { AdventureGenerator } from './adventure-generator';
import { DeleteButton } from './delete-button';
import { timeAgo } from '@/lib/client';

export const metadata = { title: 'Adventures' };

const SOURCE_LABEL = { bundled: 'Official Taleweaver', generated: 'AI-crafted', imported: 'Imported' } as const;

export default async function PlayPage() {
  const user = await requireUser();
  const adventures = listAdventures(user);
  const games = listGames(user.id);
  const models = listModels({ enabledOnly: true }).map((m) => ({ id: m.id, label: `${m.label} — ${m.providerLabel}` }));
  const active = games.filter((g) => g.status === 'active');
  const finished = games.filter((g) => g.status === 'ended');

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-4 py-8">
      {models.length === 0 && (
        <Card className="border-ember/40">
          <p className="font-display text-lg text-ember">No Dungeon Master yet</p>
          <p className="mt-1 text-sm text-parchment-dim">
            {user.role === 'admin' ? (
              <>
                Add an API key and enable at least one model in <Link href="/admin" className="text-ember underline">Admin → AI models</Link> before starting an adventure.
              </>
            ) : (
              'The admin has not enabled any AI models yet.'
            )}
          </p>
        </Card>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl">Continue your tale</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((g) => (
              <Card key={g.id} className="flex items-center justify-between gap-3 !p-4">
                <Link href={`/play/${g.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg text-parchment hover:text-ember">{g.title}</p>
                  <p className="text-xs text-parchment-dim">
                    {g.characterName} · {timeAgo(g.updatedAt)}
                  </p>
                </Link>
                <DeleteButton url={`/api/games/${g.id}`} confirmText="Abandon this adventure? It cannot be recovered." />
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl">Choose a one-shot</h2>
            <p className="text-sm text-parchment-dim">Each is a complete adventure for a single hero, playable in an evening.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adventures.map((a) => (
            <Card key={a.id} className="flex flex-col transition hover:border-ember/50">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-display text-xl leading-tight">{a.title}</h3>
                {a.source !== 'bundled' && (a.ownerId === user.id || user.role === 'admin') && (
                  <DeleteButton url={`/api/adventures/${a.id}`} confirmText={`Delete "${a.title}"?`} />
                )}
              </div>
              <p className="mb-4 flex-1 font-story text-[15px] leading-relaxed text-parchment/90">{a.blurb}</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                <Tag tone="ember">Level {a.level}</Tag>
                <Tag>{a.length}</Tag>
                {a.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                {a.warnings.map((w) => (
                  <Tag key={w} tone="warn">
                    ⚠ {w}
                  </Tag>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-parchment-dim/70">{SOURCE_LABEL[a.source]}</span>
                <Link
                  href={`/play/new/${a.id}`}
                  aria-label={`Begin ${a.title}`}
                  className="rounded-lg bg-ember px-4 py-1.5 text-sm font-semibold text-ink-950 hover:bg-ember-bright"
                >
                  Begin
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-display text-2xl">Ask the DM for something new</h2>
        <p className="mb-3 text-sm text-parchment-dim">The AI pitches three fresh one-shots built on the free SRD rules. Pick one and it writes the full adventure.</p>
        <AdventureGenerator models={models} initialPitches={listPitches(user)} defaultModel={user.prefs.lastModel} />
      </section>

      {finished.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl text-parchment-dim">Finished tales</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {finished.map((g) => (
              <Link key={g.id} href={`/play/${g.id}`} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-parchment-dim hover:border-ink-600 hover:text-parchment">
                {g.title} <span className="opacity-60">· {g.characterName}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <Attribution />
    </main>
  );
}
