import { Fragment, type ReactNode } from 'react';
import type { GameEvent } from '@/server/dm/types';

/** Minimal, safe formatter for DM prose: paragraphs, line breaks, *italic*, **bold**. No HTML passes through. */
export function StoryText({ text, streaming }: { text: string; streaming?: boolean }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className="story font-story text-[17px] leading-relaxed text-parchment">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(line)}
            </Fragment>
          ))}
          {streaming && i === paragraphs.length - 1 && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-ember/70 align-middle" />}
        </p>
      ))}
      {streaming && paragraphs.length === 0 && <span className="inline-block h-4 w-2 animate-pulse bg-ember/70 align-middle" />}
    </div>
  );
}

function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++} className="text-parchment">{tok.slice(2, -2)}</strong>);
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function EventChips({ events }: { events: GameEvent[] }) {
  const shown = events.filter((e) => e.type !== 'scene' && e.type !== 'sfx' && e.type !== 'combatant');
  if (!shown.length) return null;
  return (
    <div className="my-3 flex flex-wrap gap-2">
      {shown.map((e, i) => (
        <EventChip key={i} event={e} />
      ))}
    </div>
  );
}

function EventChip({ event: e }: { event: GameEvent }) {
  switch (e.type) {
    case 'roll': {
      const tone =
        e.critical === 'hit'
          ? 'border-ember bg-ember/15 text-ember-bright'
          : e.critical === 'miss'
            ? 'border-blood bg-blood/15 text-red-300'
            : e.success === true
              ? 'border-verdant/60 bg-verdant/10 text-green-200'
              : e.success === false
                ? 'border-blood/50 bg-blood/10 text-red-200'
                : 'border-ink-600 bg-ink-800 text-parchment';
      const dice = e.kept && e.kept.length !== e.rolls.length ? `[${e.rolls.join(', ')}] keep ${e.kept.join(', ')}` : `[${e.rolls.join(', ')}]`;
      return (
        <span className={`animate-dice inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${tone}`} title={`${e.expr} → ${dice}${e.modifier ? ` ${e.modifier > 0 ? '+' : ''}${e.modifier}` : ''}`}>
          <span aria-hidden>🎲</span>
          <span>{e.label}</span>
          <span className="font-mono text-sm font-bold">{e.total}</span>
          {e.dc !== undefined && <span className="opacity-70">vs {e.dc}</span>}
          {e.critical === 'hit' && <span className="font-semibold">CRIT!</span>}
          {e.critical === 'miss' && <span className="font-semibold">nat 1</span>}
          {e.critical == null && e.success !== undefined && <span>{e.success ? '✓' : '✗'}</span>}
        </span>
      );
    }
    case 'hp':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${e.delta < 0 ? 'border-blood/50 text-red-200' : 'border-verdant/50 text-green-200'}`}>
          {e.delta < 0 ? '🩸' : '✚'} {e.target} {e.delta > 0 ? '+' : ''}
          {e.delta} HP <span className="opacity-70">({e.hp}/{e.maxHp})</span>
        </span>
      );
    case 'item':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-parchment-dim">
          {e.action === 'add' ? '＋' : '－'} {e.item}
        </span>
      );
    case 'gold':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-700/60 px-2.5 py-1 text-xs text-amber-200">
          🪙 {e.delta > 0 ? '+' : ''}
          {e.delta} gp
        </span>
      );
    case 'condition':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-arcane/50 px-2.5 py-1 text-xs text-violet-200">
          {e.target}: {e.active ? '' : 'no longer '}
          {e.condition}
        </span>
      );
    case 'progress':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-xs italic text-parchment-dim">📜 {e.note}</span>
      );
    case 'end':
      return <span className="inline-flex items-center gap-1.5 rounded-lg border border-ember px-2.5 py-1 text-xs text-ember">✦ The End</span>;
    default:
      return null;
  }
}
