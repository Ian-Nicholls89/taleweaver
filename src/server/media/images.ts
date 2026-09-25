import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getDb, mediaDir, schema } from '../db';
import { newId } from '../crypto';
import { getProviderKey } from '../llm/registry';
import { getSetting, type ImageSettings } from '../settings';

type Generated = { data: Uint8Array; ext: 'png' | 'webp' | 'jpg' | 'svg' };

const TIMEOUT = 180_000;

async function fetchOk(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }
  return res;
}

function extFromType(type: string | null): Generated['ext'] {
  if (type?.includes('webp')) return 'webp';
  if (type?.includes('jpeg') || type?.includes('jpg')) return 'jpg';
  return 'png';
}

async function download(url: string): Promise<Generated> {
  const res = await fetchOk(url);
  return { data: new Uint8Array(await res.arrayBuffer()), ext: extFromType(res.headers.get('content-type')) };
}

function requireKey(provider: string) {
  const key = getProviderKey(provider);
  if (!key) throw new Error(`No ${provider} API key saved`);
  return key;
}

const NEGATIVE = 'text, watermark, signature, blurry, deformed, extra limbs, ui, frame';

const GENERATORS: Record<Exclude<ImageSettings['provider'], 'none'>, (prompt: string, s: ImageSettings) => Promise<Generated>> = {
  async openai(prompt, s) {
    const openai = createOpenAI({ apiKey: requireKey('openai') });
    const { image } = await generateImage({
      model: openai.image(s.model || 'gpt-image-1'),
      prompt,
      size: '1536x1024',
      abortSignal: AbortSignal.timeout(TIMEOUT),
    });
    return { data: image.uint8Array, ext: extFromType(image.mediaType) };
  },

  async replicate(prompt, s) {
    const key = requireKey('replicate');
    const model = s.model || 'black-forest-labs/flux-schnell';
    const res = await fetchOk(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
      body: JSON.stringify({ input: { prompt, aspect_ratio: '16:9', output_format: 'webp' } }),
    });
    let prediction = (await res.json()) as any;
    const deadline = Date.now() + TIMEOUT;
    while (!['succeeded', 'failed', 'canceled'].includes(prediction.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      prediction = await (await fetchOk(prediction.urls.get, { headers: { Authorization: `Bearer ${key}` } })).json();
    }
    if (prediction.status !== 'succeeded') throw new Error(`Replicate: ${prediction.error ?? prediction.status}`);
    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return download(out);
  },

  async stability(prompt) {
    const key = requireKey('stability');
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('negative_prompt', NEGATIVE);
    form.set('aspect_ratio', '16:9');
    form.set('output_format', 'webp');
    const res = await fetchOk('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
      body: form,
    });
    return { data: new Uint8Array(await res.arrayBuffer()), ext: 'webp' };
  },

  async a1111(prompt, s) {
    if (!s.baseUrl) throw new Error('Set the Automatic1111 URL in admin settings');
    const res = await fetchOk(new URL('/sdapi/v1/txt2img', s.baseUrl).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, negative_prompt: NEGATIVE, width: 1024, height: 576, steps: 25, cfg_scale: 6 }),
    });
    const json = (await res.json()) as { images?: string[] };
    if (!json.images?.[0]) throw new Error('Automatic1111 returned no image');
    return { data: Buffer.from(json.images[0], 'base64'), ext: 'png' };
  },

  async comfyui(prompt, s) {
    if (!s.baseUrl) throw new Error('Set the ComfyUI URL in admin settings');
    if (!s.comfyWorkflow.includes('%PROMPT%')) throw new Error('The ComfyUI workflow must contain the %PROMPT% placeholder');
    const workflow = JSON.parse(s.comfyWorkflow.replaceAll('%PROMPT%', JSON.stringify(prompt).slice(1, -1)));
    const res = await fetchOk(new URL('/prompt', s.baseUrl).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
    const { prompt_id } = (await res.json()) as { prompt_id: string };
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const hist = (await (await fetchOk(new URL(`/history/${prompt_id}`, s.baseUrl).toString())).json()) as any;
      const outputs = hist?.[prompt_id]?.outputs;
      if (outputs) {
        for (const node of Object.values<any>(outputs)) {
          const img = node.images?.[0];
          if (img) {
            const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' });
            return download(new URL(`/view?${q}`, s.baseUrl).toString());
          }
        }
      }
    }
    throw new Error('ComfyUI timed out');
  },

  async mock(prompt) {
    const safe = prompt.replace(/[<>&"]/g, '').slice(0, 80);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="864" viewBox="0 0 1536 864"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#78350f"/></linearGradient></defs><rect width="1536" height="864" fill="url(#g)"/><text x="768" y="432" fill="#fde68a" font-family="serif" font-size="36" text-anchor="middle">${safe}</text></svg>`;
    return { data: new TextEncoder().encode(svg), ext: 'svg' };
  },
};

// Keep at most two generations running at once.
let running = 0;
const queue: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

/** Queues an illustration for a scene. Returns the image id, or null when images are off. */
export function startImageGeneration(gameId: string, scenePrompt: string): string | null {
  const settings = getSetting('image');
  if (settings.provider === 'none') return null;
  const prompt = `${scenePrompt.trim()}. ${settings.style}`.slice(0, 1500);
  const id = newId();
  const db = getDb();
  db.insert(schema.images).values({ id, gameId, prompt, status: 'pending' }).run();
  void withSlot(() => GENERATORS[settings.provider as keyof typeof GENERATORS](prompt, settings))
    .then((img) => {
      const file = `${id}.${img.ext}`;
      fs.writeFileSync(path.join(/*turbopackIgnore: true*/ mediaDir(), file), img.data);
      db.update(schema.images).set({ status: 'ready', file }).where(eq(schema.images.id, id)).run();
    })
    .catch((err) => {
      console.error('[taleweaver] image generation failed:', err);
      db.update(schema.images)
        .set({ status: 'failed', error: String(err?.message ?? err).slice(0, 500) })
        .where(eq(schema.images.id, id))
        .run();
    });
  return id;
}

export function getImage(id: string) {
  return getDb().select().from(schema.images).where(eq(schema.images.id, id)).get() ?? null;
}

export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
};
