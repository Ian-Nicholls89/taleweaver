import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from './db';

export const imageSettingsSchema = z.object({
  provider: z.enum(['none', 'openai', 'replicate', 'stability', 'a1111', 'comfyui', 'mock']),
  model: z.string().max(200).default(''),
  baseUrl: z.string().max(500).default(''),
  style: z.string().max(500),
  comfyWorkflow: z.string().max(100_000).default(''),
});

export const ttsSettingsSchema = z.object({
  provider: z.enum(['browser', 'openai', 'elevenlabs']),
  voice: z.string().max(200).default(''),
  model: z.string().max(200).default(''),
});

export const limitsSchema = z.object({
  dailyTokenCap: z.number().int().min(0).nullable(),
  summarizerModel: z.string().max(300).nullable(),
});

const DEFAULTS = {
  image: {
    provider: 'none',
    model: '',
    baseUrl: '',
    style:
      'painterly fantasy illustration, dramatic lighting, rich colour, detailed environment, no text, no watermark',
    comfyWorkflow: '',
  } as z.infer<typeof imageSettingsSchema>,
  tts: { provider: 'browser', voice: '', model: '' } as z.infer<typeof ttsSettingsSchema>,
  limits: { dailyTokenCap: null, summarizerModel: null } as z.infer<typeof limitsSchema>,
};

type Settings = typeof DEFAULTS;
export type ImageSettings = Settings['image'];
export type TtsSettings = Settings['tts'];

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as Settings[K];
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
