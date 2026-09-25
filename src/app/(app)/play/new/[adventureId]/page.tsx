import { notFound } from 'next/navigation';
import { Attribution } from '@/components/attribution';
import { requireUser } from '@/server/auth/current';
import { getAdventure } from '@/server/adventures';
import { builderOptions, buildCharacter, pregens } from '@/server/characters';
import { listModels } from '@/server/llm/registry';
import { Tag } from '@/components/ui';
import { NewGameForm } from './new-game-form';

export default async function NewGamePage({ params }: { params: Promise<{ adventureId: string }> }) {
  const { adventureId } = await params;
  const user = await requireUser();
  const adventure = getAdventure(adventureId, user);
  if (!adventure || adventure.status !== 'ready') notFound();
  const models = listModels({ enabledOnly: true }).map((m) => ({
    id: m.id,
    label: m.label,
    providerLabel: m.providerLabel,
    toolSupport: m.toolSupport,
    costHint: m.costHint,
  }));
  const suggestedLevel = Math.min(3, Math.max(1, parseInt(adventure.level, 10) || 1));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm uppercase tracking-widest text-parchment-dim">New adventure</p>
      <h1 className="mt-1 font-display text-3xl text-ember">{adventure.title}</h1>
      <p className="mt-3 max-w-3xl font-story text-lg leading-relaxed">{adventure.blurb}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tag tone="ember">Level {adventure.level}</Tag>
        <Tag>{adventure.length}</Tag>
        {adventure.warnings.map((w) => (
          <Tag key={w} tone="warn">
            ⚠ {w}
          </Tag>
        ))}
      </div>
      <NewGameForm
        adventureId={adventure.id}
        models={models}
        defaultModel={user.prefs.lastModel}
        suggestedLevel={suggestedLevel}
        pregens={pregens().map((p) => ({ id: p.id, blurb: p.blurb, character: buildCharacter({ ...p.input, level: suggestedLevel }) }))}
        options={builderOptions()}
      />
      <Attribution />
    </main>
  );
}
