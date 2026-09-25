'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ErrorText, Input, Label, Select, Textarea } from '@/components/ui';
import { CharacterSummary } from '@/components/character-summary';
import { apiFetch } from '@/lib/client';
import type { Character } from '@/server/dm/types';

type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

type Options = {
  classes: Record<string, { hitDie: number; skillChoices: number; skillList: string[]; priority: Ability[] }>;
  species: Record<string, { traits: string[]; extraSkill: string | null }>;
  backgrounds: Record<string, { abilities: Ability[]; skills: string[]; feat: string }>;
  standardArray: number[];
};

type Model = { id: string; label: string; providerLabel: string; toolSupport: boolean; costHint: string | null };

export function NewGameForm(props: {
  adventureId: string;
  models: Model[];
  defaultModel?: string;
  suggestedLevel: number;
  pregens: Array<{ id: string; blurb: string; character: Character }>;
  options: Options;
}) {
  const router = useRouter();
  const [model, setModel] = useState(props.models.find((m) => m.id === props.defaultModel)?.id ?? props.models[0]?.id ?? '');
  const [mode, setMode] = useState<'pregen' | 'build'>('pregen');
  const [pregenId, setPregenId] = useState(props.pregens[0]?.id ?? '');
  const [level, setLevel] = useState(props.suggestedLevel);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // builder state
  const o = props.options;
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Human');
  const [className, setClassName] = useState('Fighter');
  const [background, setBackground] = useState('Soldier');
  const [skills, setSkills] = useState<string[]>([]);
  const [manualScores, setManualScores] = useState(false);
  const [scores, setScores] = useState<Record<Ability, number>>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  const [plusTwo, setPlusTwo] = useState<Ability | ''>('');
  const [plusOne, setPlusOne] = useState<Ability | ''>('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<Character | null>(null);

  const cls = o.classes[className]!;
  const bg = o.backgrounds[background]!;
  const sp = o.species[species]!;
  const fixedSkills = useMemo(() => new Set([...bg.skills, ...(sp.extraSkill ? [sp.extraSkill] : [])]), [bg, sp]);

  const build = useMemo(
    () => ({
      name: name.trim() || 'Nameless Hero',
      species,
      className,
      background,
      level,
      skills: skills.filter((s) => cls.skillList.includes(s) && !fixedSkills.has(s)),
      scores: manualScores ? scores : undefined,
      plusTwo: plusTwo || undefined,
      plusOne: plusOne || undefined,
      description: description.trim() || undefined,
    }),
    [name, species, className, background, level, skills, manualScores, scores, plusTwo, plusOne, description, cls, fixedSkills],
  );

  useEffect(() => {
    if (mode !== 'build') return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ character: Character }>('/api/characters/preview', { method: 'POST', json: build });
        setPreview(res.character);
        setError('');
      } catch (e) {
        setPreview(null);
        setError((e as Error).message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [build, mode]);

  // Reset choices that no longer apply.
  useEffect(() => setSkills([]), [className]);
  useEffect(() => {
    setPlusTwo('');
    setPlusOne('');
  }, [background]);

  const selectedModel = props.models.find((m) => m.id === model);
  const pregenLevelled = props.pregens.find((p) => p.id === pregenId);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const character = mode === 'pregen' ? { pregenId, level } : { build };
      const res = await apiFetch<{ id: string }>('/api/games', { method: 'POST', json: { adventureId: props.adventureId, modelKey: model, character } });
      void apiFetch('/api/me', { method: 'PATCH', json: { lastModel: model } }).catch(() => {});
      router.push(`/play/${res.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const duplicateScores = manualScores && new Set(Object.values(scores)).size !== 6;

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <h2 className="mb-3 font-display text-xl">Your Dungeon Master</h2>
        {props.models.length === 0 ? (
          <p className="text-sm text-parchment-dim">No models are enabled yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Select value={model} onChange={(e) => setModel(e.target.value)} className="max-w-md" aria-label="Dungeon Master model">
              {props.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.providerLabel}
                  {m.costHint ? ` (${m.costHint})` : ''}
                </option>
              ))}
            </Select>
            {selectedModel && !selectedModel.toolSupport && (
              <p className="text-sm text-amber-300">⚠ This model can’t use tools: you’ll roll your own dice and the DM tracks HP by hand.</p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-xl">Your hero</h2>
          <div className="flex rounded-lg border border-ink-600 p-0.5 text-sm">
            {(['pregen', 'build'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 ${mode === m ? 'bg-ember text-ink-950' : 'text-parchment-dim hover:text-parchment'}`}>
                {m === 'pregen' ? 'Ready-made heroes' : 'Build your own'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-parchment-dim">
            Level
            <Select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="!w-20">
              {[1, 2, 3].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </label>
        </div>

        {mode === 'pregen' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <div className="grid gap-2">
              {props.pregens.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPregenId(p.id)}
                  className={`rounded-lg border p-3 text-left transition ${pregenId === p.id ? 'border-ember bg-ember/10' : 'border-ink-700 hover:border-ink-600'}`}
                >
                  <p className="font-display">
                    {p.character.name} <span className="text-sm text-parchment-dim">— {p.character.species} {p.character.className}</span>
                  </p>
                  <p className="text-sm text-parchment-dim">{p.blurb}</p>
                </button>
              ))}
            </div>
            {pregenLevelled && <CharacterSummary character={{ ...pregenLevelled.character }} note={level !== props.suggestedLevel ? `Shown at level ${props.suggestedLevel}; will start at level ${level}.` : undefined} />}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-4">
              <label className="block">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Rowan Ashby" />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <Label>Species</Label>
                  <Select value={species} onChange={(e) => setSpecies(e.target.value)}>
                    {Object.keys(o.species).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <Label>Class</Label>
                  <Select value={className} onChange={(e) => setClassName(e.target.value)}>
                    {Object.keys(o.classes).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <Label>Background</Label>
                  <Select value={background} onChange={(e) => setBackground(e.target.value)}>
                    {Object.keys(o.backgrounds).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </label>
              </div>

              <div>
                <Label hint={`${bg.abilities.map((a) => a.toUpperCase()).join(' / ')} from ${background}`}>Ability boosts</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={plusTwo} onChange={(e) => setPlusTwo(e.target.value as Ability)}>
                    <option value="">+2 (auto)</option>
                    {bg.abilities.map((a) => (
                      <option key={a} value={a}>
                        +2 {a.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                  <Select value={plusOne} onChange={(e) => setPlusOne(e.target.value as Ability)}>
                    <option value="">+1 (auto)</option>
                    {bg.abilities.map((a) => (
                      <option key={a} value={a}>
                        +1 {a.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm text-parchment-dim">
                  <input type="checkbox" checked={manualScores} onChange={(e) => setManualScores(e.target.checked)} className="accent-ember" />
                  Assign the standard array myself (otherwise it’s arranged for your class)
                </label>
                {manualScores && (
                  <div className="grid grid-cols-6 gap-1.5">
                    {ABILITIES.map((a) => (
                      <label key={a} className="text-center text-xs text-parchment-dim">
                        {a.toUpperCase()}
                        <Select value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: Number(e.target.value) })} className="!px-1 text-center">
                          {o.standardArray.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Select>
                      </label>
                    ))}
                  </div>
                )}
                {duplicateScores && <p className="mt-1 text-xs text-amber-300">Use each value once.</p>}
              </div>

              <div>
                <Label hint={`choose ${cls.skillChoices}; unpicked ones are filled automatically`}>Class skills</Label>
                <div className="flex flex-wrap gap-1.5">
                  {cls.skillList.map((s) => {
                    const fixed = fixedSkills.has(s);
                    const on = fixed || skills.includes(s);
                    return (
                      <button
                        key={s}
                        disabled={fixed || (!on && skills.length >= cls.skillChoices)}
                        onClick={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])}
                        className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition disabled:opacity-40 ${on ? 'border-ember bg-ember/15 text-ember' : 'border-ink-600 text-parchment-dim hover:border-ink-500'}`}
                        title={fixed ? 'Already granted by species or background' : undefined}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <Label hint="optional — the DM uses this">Look and personality</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
              </label>
            </div>
            {preview ? <CharacterSummary character={preview} /> : <div className="text-sm text-parchment-dim">Building…</div>}
          </div>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button onClick={start} disabled={busy || !model || (mode === 'build' && (!preview || duplicateScores))} className="px-8 py-3 text-base">
          {busy ? 'Lighting the lanterns…' : 'Begin the adventure'}
        </Button>
      </div>
    </div>
  );
}
