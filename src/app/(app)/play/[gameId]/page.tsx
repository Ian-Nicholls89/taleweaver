import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/server/auth/current';
import { gameMessages, getGame, isTurnInProgress } from '@/server/dm/engine';
import { getDb, schema } from '@/server/db';
import { listModels } from '@/server/llm/registry';
import { getSetting } from '@/server/settings';
import { OPENING_PLAYER_TEXT } from '@/server/dm/prompt';
import { GameView } from './game-view';

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const user = await requireUser();
  const game = getGame(gameId, user.id);
  if (!game) notFound();
  const adventure = getDb().select({ title: schema.adventures.title }).from(schema.adventures).where(eq(schema.adventures.id, game.adventureId)).get();
  const models = listModels({ enabledOnly: true }).map((m) => ({ id: m.id, label: `${m.label} — ${m.providerLabel}`, toolSupport: m.toolSupport }));
  if (!models.some((m) => m.id === game.modelKey)) models.unshift({ id: game.modelKey, label: `${game.modelKey} (disabled)`, toolSupport: true });

  return (
    <GameView
      gameId={game.id}
      title={adventure?.title ?? 'Adventure'}
      initial={{
        character: game.character,
        state: game.state,
        status: game.status,
        modelKey: game.modelKey,
        turnInProgress: isTurnInProgress(game.id),
        messages: gameMessages(game.id).map((m) => ({ id: m.id, role: m.role, content: m.content, events: m.events })),
      }}
      models={models}
      openingText={OPENING_PLAYER_TEXT}
      ttsMode={getSetting('tts').provider === 'browser' ? 'browser' : 'server'}
      prefs={user.prefs}
    />
  );
}
