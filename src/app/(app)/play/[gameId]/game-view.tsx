'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ErrorText, Select } from '@/components/ui';
import { apiFetch } from '@/lib/client';
import { AudioEngine } from '@/lib/audio';
import { Narrator } from '@/lib/narration';
import type { Character, GameEvent, GameState } from '@/server/dm/types';
import type { UserPrefs } from '@/server/db/schema';
import { EventChips, StoryText } from './story';
import { CharacterSheet, Combatants } from './sheet';
import { Attribution } from '@/components/attribution';

type Msg = { id: number; role: 'player' | 'dm'; content: string; events: GameEvent[] };
type Model = { id: string; label: string; toolSupport: boolean };

const QUICK_ACTIONS = ['I look around carefully.', 'I talk to them.', 'I attack!', 'I search the area.', 'I try to sneak past.', 'I take a short rest.'];
const DICE = [4, 6, 8, 10, 12, 20];

export function GameView(props: {
  gameId: string;
  title: string;
  initial: { character: Character; state: GameState; status: 'active' | 'ended'; modelKey: string; turnInProgress: boolean; messages: Msg[] };
  models: Model[];
  openingText: string;
  ttsMode: 'browser' | 'server';
  prefs: UserPrefs;
}) {
  const { gameId } = props;
  const [messages, setMessages] = useState<Msg[]>(props.initial.messages);
  const [character, setCharacter] = useState(props.initial.character);
  const [state, setState] = useState(props.initial.state);
  const [status, setStatus] = useState(props.initial.status);
  const [modelKey, setModelKey] = useState(props.initial.modelKey);
  const [streamText, setStreamText] = useState('');
  const [streamEvents, setStreamEvents] = useState<GameEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(props.initial.turnInProgress);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [entered, setEntered] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [image, setImage] = useState<{ id: string; status: 'pending' | 'ready' | 'failed' } | null>(
    props.initial.state.scene?.imageId ? { id: props.initial.state.scene.imageId, status: 'pending' } : null,
  );
  const [music, setMusic] = useState(props.prefs.musicVolume ?? 0.5);
  const [sfx, setSfx] = useState(props.prefs.sfxVolume ?? 0.7);
  const [narration, setNarration] = useState(props.prefs.narration ?? false);
  const [voice, setVoice] = useState(props.prefs.voice ?? '');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [modifier, setModifier] = useState(0);

  const audio = useRef<AudioEngine | null>(null);
  const narrator = useRef<Narrator | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- audio & narration setup ----
  useEffect(() => {
    audio.current = new AudioEngine();
    narrator.current = new Narrator(props.ttsMode, props.prefs.voice);
    narrator.current.onSpeakingChange = (s) => {
      setSpeaking(s);
      audio.current?.duck(s);
    };
    const loadVoices = () => setVoices(Narrator.browserVoices());
    loadVoices();
    if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      narrator.current?.stop();
      audio.current?.dispose();
    };
  }, [props.ttsMode, props.prefs.voice]);

  useEffect(() => audio.current?.setVolumes(music, sfx), [music, sfx]);
  useEffect(() => narrator.current?.setVoice(voice || undefined), [voice]);

  // Save audio preferences (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      void apiFetch('/api/me', { method: 'PATCH', json: { musicVolume: music, sfxVolume: sfx, narration, voice } }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [music, sfx, narration, voice]);

  // ---- scene image polling ----
  useEffect(() => {
    if (!image || image.status !== 'pending') return;
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await apiFetch<{ status: 'pending' | 'ready' | 'failed' }>(`/api/images/${image.id}/status`);
        if (cancelled) return;
        if (res.status !== 'pending') return setImage({ id: image.id, status: res.status });
      } catch {
        return setImage({ id: image.id, status: 'failed' });
      }
      if (++tries < 90) setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [image]);

  // ---- auto-scroll ----
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, streamText, streamEvents]);

  const handleEvent = useCallback((e: GameEvent) => {
    if (e.type === 'roll') void audio.current?.playSfx('dice');
    if (e.type === 'sfx') void audio.current?.playSfx(e.name);
    if (e.type === 'scene') {
      void audio.current?.setAmbience(e.ambience);
      if (e.imageId) setImage({ id: e.imageId, status: 'pending' });
    }
  }, []);

  const reload = useCallback(async () => {
    const res = await apiFetch<{ game: { character: Character; state: GameState; status: 'active' | 'ended' }; messages: Msg[]; turnInProgress: boolean }>(`/api/games/${gameId}`);
    setMessages(res.messages);
    setCharacter(res.game.character);
    setState(res.game.state);
    setStatus(res.game.status);
    if (res.game.state.scene?.imageId) setImage((img) => (img?.id === res.game.state.scene?.imageId ? img : { id: res.game.state.scene!.imageId!, status: 'pending' }));
    return res.turnInProgress;
  }, [gameId]);

  // After a reload mid-turn, the server is still finishing the DM's reply: wait for it.
  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      const still = await reload().catch(() => false);
      if (cancelled) return;
      if (still && ++tries < 90) setTimeout(tick, 1500);
      else setWaiting(false);
    };
    const t = setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [waiting, reload]);

  const sendTurn = useCallback(
    async (text: string | null) => {
      if (busy) return;
      setBusy(true);
      setError('');
      setStreamText('');
      setStreamEvents([]);
      narrator.current?.stop();
      let fullText = '';
      const events: GameEvent[] = [];
      let sawError = false;
      try {
        const res = await fetch(`/api/games/${gameId}/turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `The DM is unavailable (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line);
            if (msg.t === 'player') {
              setMessages((m) => [...m, { id: msg.id, role: 'player', content: msg.content, events: [] }]);
              if (text !== null) setInput('');
            } else if (msg.t === 'text') {
              fullText += msg.v;
              setStreamText(fullText);
            } else if (msg.t === 'event') {
              events.push(msg.v);
              setStreamEvents([...events]);
              handleEvent(msg.v);
            } else if (msg.t === 'done') {
              setMessages((m) => [...m, { id: msg.messageId, role: 'dm', content: fullText.trim(), events }]);
              setCharacter(msg.character);
              setState(msg.state);
              setStatus(msg.status);
              if (narration) void narrator.current?.speak(fullText);
            } else if (msg.t === 'error') {
              sawError = true;
              setError(msg.message);
            }
          }
        }
      } catch (e) {
        sawError = true;
        setError((e as Error).message);
      } finally {
        setStreamText('');
        setStreamEvents([]);
        setBusy(false);
        if (sawError) void reload().catch(() => {});
        inputRef.current?.focus();
      }
    },
    [busy, gameId, handleEvent, narration, reload],
  );

  async function enter() {
    await audio.current?.unlock();
    setEntered(true);
    if (state.scene) void audio.current?.setAmbience(state.scene.ambience);
    if (messages.length === 0 && status === 'active' && !waiting) void sendTurn(null);
  }

  async function roll(sides: number) {
    const expr = `1d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`;
    try {
      const r = await apiFetch<{ total: number; rolls: number[] }>(`/api/games/${gameId}/roll`, { method: 'POST', json: { expr } });
      void audio.current?.playSfx('dice');
      const note = `(I rolled ${expr}: ${r.total}${sides === 20 && r.rolls[0] === 20 ? ' — natural 20!' : sides === 20 && r.rolls[0] === 1 ? ' — natural 1' : ''})`;
      setInput((s) => (s ? `${s.trim()} ${note}` : note));
      inputRef.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changeModel(id: string) {
    setModelKey(id);
    try {
      await apiFetch(`/api/games/${gameId}`, { method: 'PATCH', json: { modelKey: id } });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy || waiting) return;
    void sendTurn(text);
  }

  const lastDm = [...messages].reverse().find((m) => m.role === 'dm');
  const currentModel = props.models.find((m) => m.id === modelKey);
  const playerDown = character.hp === 0;

  return (
    <div className="mx-auto grid h-[calc(100dvh-var(--header-h))] max-w-7xl grid-cols-1 lg:grid-cols-[1fr_340px]">
      {/* ---- main column ---- */}
      <section className="flex min-h-0 flex-col border-ink-800 lg:border-r">
        <SceneBanner title={state.scene?.title ?? props.title} adventure={props.title} image={image} onImageError={() => image && setImage({ ...image, status: 'failed' })} />

        <div ref={logRef} className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.map((m) =>
            m.role === 'player' ? (
              m.content === props.openingText ? null : (
                <div key={m.id} className="animate-fade-in flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-ink-600 bg-ink-800 px-4 py-2 text-[15px] italic text-parchment-dim">{m.content}</p>
                </div>
              )
            ) : (
              <article key={m.id} className="animate-fade-in">
                <EventChips events={m.events} />
                <StoryText text={m.content} />
              </article>
            ),
          )}
          {waiting && !busy && (
            <p className="animate-pulse font-story italic text-parchment-dim">The Dungeon Master is still speaking…</p>
          )}
          {busy && (
            <article>
              <EventChips events={streamEvents} />
              <StoryText text={streamText} streaming />
            </article>
          )}
          {status === 'ended' && (
            <div className="rounded-xl border border-ember/50 bg-ember/5 p-5 text-center">
              <p className="font-display text-2xl text-ember">The End</p>
              {state.outcome && <p className="mt-2 font-story text-parchment">{state.outcome}</p>}
              <Link href="/play" className="mt-3 inline-block text-sm text-ember hover:underline">
                Choose another adventure →
              </Link>
            </div>
          )}
        </div>

        {status === 'active' && (
          <form onSubmit={submit} className="border-t border-ink-800 bg-ink-950/80 px-4 py-3 sm:px-8">
            <ErrorText>{error}</ErrorText>
            {playerDown && <p className="mb-2 text-sm text-red-300">You are at 0 HP. Tell the DM to roll your death saving throw, or describe a last-ditch act.</p>}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button key={a} type="button" onClick={() => setInput(a)} className="rounded-full border border-ink-600 px-2.5 py-0.5 text-xs text-parchment-dim hover:border-ember/50 hover:text-parchment">
                  {a}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) submit(e);
                }}
                rows={2}
                maxLength={4000}
                placeholder={busy ? 'The DM is speaking…' : 'What do you do?'}
                className="scrollbar-thin flex-1 resize-none rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 font-story text-[16px] text-parchment placeholder:text-parchment-dim/50 focus:border-ember focus:outline-none"
                aria-label="Your action"
              />
              <Button type="submit" disabled={busy || waiting || !input.trim()} className="h-11">
                {busy ? '…' : 'Act'}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-parchment-dim">
              <span>Roll:</span>
              {DICE.map((d) => (
                <button key={d} type="button" onClick={() => roll(d)} className="rounded-md border border-ink-600 px-2 py-0.5 font-mono hover:border-ember hover:text-ember">
                  d{d}
                </button>
              ))}
              <label className="ml-1 flex items-center gap-1">
                mod
                <input type="number" value={modifier} onChange={(e) => setModifier(Math.max(-20, Math.min(20, Number(e.target.value) || 0)))} className="w-12 rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-parchment" />
              </label>
              {currentModel && !currentModel.toolSupport && <span className="ml-auto text-amber-300/80">This DM can’t roll — use the dice when asked.</span>}
              <button type="button" onClick={() => setShowSheet((s) => !s)} className="ml-auto rounded-md border border-ink-600 px-2 py-0.5 lg:hidden">
                {showSheet ? 'Hide' : 'Show'} sheet
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ---- sidebar ---- */}
      <aside className={`scrollbar-thin min-h-0 space-y-4 overflow-y-auto bg-ink-900/40 p-4 ${showSheet ? 'block' : 'hidden'} lg:block`}>
        <CharacterSheet character={character} />
        <Combatants combatants={state.combatants} />

        <div className="rounded-xl border border-ink-700 p-4 text-sm">
          <p className="mb-3 font-display text-parchment">Sound & voice</p>
          <label className="mb-2 flex items-center gap-3 text-parchment-dim">
            <span className="w-20">Ambience</span>
            <input type="range" min={0} max={1} step={0.05} value={music} onChange={(e) => setMusic(Number(e.target.value))} className="flex-1 accent-ember" />
          </label>
          <label className="mb-3 flex items-center gap-3 text-parchment-dim">
            <span className="w-20">Effects</span>
            <input type="range" min={0} max={1} step={0.05} value={sfx} onChange={(e) => setSfx(Number(e.target.value))} className="flex-1 accent-ember" />
          </label>
          <label className="mb-2 flex items-center gap-2 text-parchment-dim">
            <input type="checkbox" checked={narration} onChange={(e) => setNarration(e.target.checked)} className="accent-ember" />
            Read narration aloud
          </label>
          {narration && props.ttsMode === 'browser' && voices.length > 0 && (
            <Select value={voice} onChange={(e) => setVoice(e.target.value)} className="mb-2 !py-1 text-xs" aria-label="Voice">
              <option value="">Default voice</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
          {lastDm && (
            <button onClick={() => (speaking ? narrator.current?.stop() : narrator.current?.speak(lastDm.content))} className="text-xs text-ember hover:underline">
              {speaking ? '■ Stop reading' : '▶ Read the last passage'}
            </button>
          )}
        </div>

        <div className="rounded-xl border border-ink-700 p-4 text-sm">
          <p className="mb-2 font-display text-parchment">Dungeon Master</p>
          <Select value={modelKey} onChange={(e) => changeModel(e.target.value)} className="!py-1 text-xs" aria-label="Model">
            {props.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
          {state.progress.length > 0 && (
            <details className="mt-3 text-xs text-parchment-dim">
              <summary className="cursor-pointer text-parchment">Milestones ({state.progress.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {state.progress.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <Attribution className="!px-0 text-left" />
      </aside>

      {!entered && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/90 p-6 backdrop-blur-sm">
          <div className="max-w-md text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-parchment-dim">{messages.length ? 'Your tale continues' : 'A new tale begins'}</p>
            <h1 className="mt-3 font-display text-4xl text-ember">{props.title}</h1>
            <p className="mt-3 text-parchment-dim">
              {character.name}, level {character.level} {character.species} {character.className}
            </p>
            <Button onClick={enter} className="mt-8 px-10 py-3 text-base">
              {messages.length ? 'Continue' : 'Enter the story'}
            </Button>
            <p className="mt-4 text-xs text-parchment-dim/70">Best with sound on.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneBanner({
  title,
  adventure,
  image,
  onImageError,
}: {
  title: string;
  adventure: string;
  image: { id: string; status: 'pending' | 'ready' | 'failed' } | null;
  onImageError: () => void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const src = image?.status === 'ready' ? `/api/images/${image.id}` : null;

  useEffect(() => {
    if (src && src !== shown) {
      setPrevious(shown);
      setShown(src);
    }
  }, [src, shown]);

  return (
    <div className="relative aspect-[21/9] max-h-[38vh] w-full shrink-0 overflow-hidden border-b border-ink-800 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950">
      {previous && <img src={previous} alt="" className="absolute inset-0 h-full w-full object-cover opacity-100" />}
      {shown && (
        <img key={shown} src={shown} alt={title} onError={onImageError} className="animate-fade-in absolute inset-0 h-full w-full object-cover" style={{ animationDuration: '1.5s' }} />
      )}
      {image?.status === 'pending' && (
        <div className="absolute right-3 top-3 rounded-full bg-ink-950/70 px-3 py-1 text-xs text-parchment-dim">
          <span className="animate-pulse">Painting the scene…</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent px-6 pb-3 pt-10">
        <p className="text-xs uppercase tracking-[0.25em] text-parchment-dim">{adventure}</p>
        <h1 className="font-display text-2xl text-parchment drop-shadow sm:text-3xl">{title}</h1>
      </div>
    </div>
  );
}
