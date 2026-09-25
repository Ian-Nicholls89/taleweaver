import type { Character } from '@/server/dm/types';

const mod = (v: number) => {
  const m = Math.floor((v - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
};

export function CharacterSummary({ character: c, note }: { character: Character; note?: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-4 text-sm">
      <p className="font-display text-lg">{c.name}</p>
      <p className="text-parchment-dim">
        Level {c.level} {c.species} {c.className} · {c.background}
      </p>
      {note && <p className="mt-1 text-xs text-amber-300/80">{note}</p>}
      <div className="mt-3 flex gap-4">
        <Stat label="HP" value={c.maxHp} />
        <Stat label="AC" value={c.ac} />
        <Stat label="Speed" value={`${c.speed} ft`} />
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1 text-center">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => [k, c.abilities[k]] as const).map(([k, v]) => (
          <div key={k} className="rounded border border-ink-700 py-1">
            <p className="text-[10px] uppercase text-parchment-dim">{k}</p>
            <p className="font-semibold">{v}</p>
            <p className="text-xs text-ember">{mod(v)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-parchment-dim">
        <span className="text-parchment">Skills:</span> <span className="capitalize">{c.skills.join(', ')}</span>
      </p>
      <p className="mt-1 text-xs text-parchment-dim">
        <span className="text-parchment">Attacks:</span> {c.attacks.map((a) => a.name).join(', ')}
      </p>
      {c.spells.length > 0 && (
        <p className="mt-1 text-xs text-parchment-dim">
          <span className="text-parchment">Spells:</span> {c.spells.join(', ')}
        </p>
      )}
      <details className="mt-2 text-xs text-parchment-dim">
        <summary className="cursor-pointer text-parchment">Features & gear</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {c.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="mt-1">{c.inventory.join(', ')} · {c.gold} gp</p>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-parchment-dim">{label}</p>
      <p className="font-display text-xl">{value}</p>
    </div>
  );
}
