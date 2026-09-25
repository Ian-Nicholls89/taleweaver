import { z } from 'zod';
import { api, readJson } from '@/server/auth/current';
import { getSetting, imageSettingsSchema, limitsSchema, setSetting, ttsSettingsSchema } from '@/server/settings';

const body = z.object({
  image: imageSettingsSchema.optional(),
  tts: ttsSettingsSchema.optional(),
  limits: limitsSchema.optional(),
});

export const GET = api(async () => ({ image: getSetting('image'), tts: getSetting('tts'), limits: getSetting('limits') }), { admin: true });

export const PUT = api(
  async ({ req }) => {
    const patch = body.parse(await readJson(req));
    if (patch.image) {
      if (patch.image.comfyWorkflow) JSON.parse(patch.image.comfyWorkflow); // reject invalid JSON early
      setSetting('image', patch.image);
    }
    if (patch.tts) setSetting('tts', patch.tts);
    if (patch.limits) setSetting('limits', patch.limits);
    return { ok: true };
  },
  { admin: true },
);
