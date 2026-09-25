import type { Character, Combatant } from '@/server/dm/types';

const modOf = (v: number) => Math.floor((v - 10) / 2);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const pb = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

function HpBar({ hp, max, temp = 0 }: { hp: number; max: number; temp?: number }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const colour = pct > 50 ? 'bg-verdant' : pct > 25 ? 'bg-amber-500' : 'bg-blood';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuenow={hp} aria-valuemax={max} aria-label="Hit points">
      <div className={`h-full ${colour} transition-all duration-700`} style={{ width: `${pct}%` }} />
      {temp > 0 && <div className="-mt-2 h-2 bg-sky-400/60" style={{ width: `${Math.min(100, (temp / Math.max(1, max)) * 100)}%` }} />}
    </div>
  );
}

export function CharacterSheet({ character: c }: { character: Character }) {
  const prof = pb(c.level);
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4 text-sm">
      <p className="font-display text-lg leading-tight">{c.name}</p>
      <p className="text-xs text-parchment-dim">
        Level {c.level} {c.species} {c.className}
      </p>

      <div className="mt-3 flex items-end gap-4">
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-parchment-dim">HP</span>
            <span className="font-mono">
              {c.hp}/{c.maxHp}
              {c.tempHp > 0 && <span className="text-sky-300"> +{c.tempHp}</span>}
            </span>
          </div>
          <HpBar hp={c.hp} max={c.maxHp} temp={c.tempHp} />
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase text-parchment-dim">AC</p>
          <p className="font-display text-xl leading-none">{c.ac}</p>
        </div>
      </div>

      {c.deathSaves && c.hp === 0 && (
        <p className="mt-2 text-xs text-red-300">
          Death saves: {'●'.repeat(c.deathSaves.successes)}
          {'○'.repeat(3 - Math.min(3, c.deathSaves.successes))} saved · {'●'.repeat(c.deathSaves.failures)}
          {'○'.repeat(3 - Math.min(3, c.deathSaves.failures))} failed
        </p>
      )}
      {c.conditions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.conditions.map((x) => (
            <span key={x} className="rounded-full border border-arcane/50 px-2 py-0.5 text-xs capitalize text-violet-200">
              {x}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-6 gap-1 text-center">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => [k, c.abilities[k]] as const).map(([k, v]) => (
          <div key={k} className="rounded border border-ink-700 py-1" title={`${k.toUpperCase()} ${v}${c.saves.includes(k as never) ? ' — save proficiency' : ''}`}>
            <p className="text-[10px] uppercase text-parchment-dim">{k}</p>
            <p className="text-xs font-semibold text-ember">{signed(modOf(v))}</p>
            <p className="text-[10px] text-parchment-dim">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-parchment-dim">Attacks</p>
        <ul className="space-y-0.5 text-xs">
          {c.attacks.map((a) => (
            <li key={a.name} className="flex justify-between gap-2">
              <span className="truncate" title={a.notes}>
                {a.name}
              </span>
              <span className="shrink-0 font-mono text-parchment-dim">
                {signed(modOf(c.abilities[a.ability]) + (a.proficient === false ? 0 : prof) + (a.hitBonus ?? 0))} · {a.damage}
                {signed(modOf(c.abilities[a.ability]))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {c.spellSlots && Object.keys(c.spellSlots).length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-parchment-dim">Spell slots</p>
          <div className="flex gap-3 text-xs">
            {Object.entries(c.spellSlots).map(([lvl, s]) => (
              <span key={lvl}>
                L{lvl}{' '}
                <span className="text-arcane">
                  {'◆'.repeat(Math.max(0, s.max - s.used))}
                  <span className="opacity-30">{'◇'.repeat(Math.min(s.max, s.used))}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-parchment-dim">
          Inventory · {c.gold} gp
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-parchment-dim">
          {c.inventory.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </details>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-parchment-dim">Skills & features</summary>
        <p className="mt-1 capitalize text-parchment-dim">{c.skills.join(', ')}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-parchment-dim">
          {c.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {c.spells.length > 0 && <p className="mt-1 text-parchment-dim">Spells: {c.spells.join(', ')}</p>}
      </details>
    </div>
  );
}

export function Combatants({ combatants }: { combatants: Combatant[] }) {
  if (!combatants.length) return null;
  return (
    <div className="rounded-xl border border-blood/40 bg-blood/5 p-4 text-sm">
      <p className="mb-2 font-display text-red-200">In combat</p>
      <ul className="space-y-2">
        {combatants.map((c) => (
          <li key={c.id}>
            <div className="mb-1 flex justify-between text-xs">
              <span className={c.hp === 0 ? 'line-through opacity-60' : ''}>{c.name}</span>
              <span className="font-mono text-parchment-dim">
                AC {c.ac} · {c.hp}/{c.maxHp}
              </span>
            </div>
            <HpBar hp={c.hp} max={c.maxHp} />
          </li>
        ))}
      </ul>
    </div>
  );
}
