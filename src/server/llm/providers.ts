import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';
import { createXai } from '@ai-sdk/xai';
import { createMistral } from '@ai-sdk/mistral';
import { createCerebras } from '@ai-sdk/cerebras';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';
import { createMockModel } from './mock';

export type ListedModel = { modelId: string; label: string; toolSupport: boolean };

type ProviderDef = {
  label: string;
  keyUrl: string;
  create: (credential: string, modelId: string) => LanguageModel;
  listModels: (credential: string) => Promise<ListedModel[]>;
  note?: string;
  /**
   * 'apiKey' (default): a secret pasted from the provider's dashboard, masked in the admin UI.
   * 'url': a server address, not a secret — shown in full, e.g. a local Ollama instance.
   */
  credentialType?: 'apiKey' | 'url';
  urlPlaceholder?: string;
};

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json() as Promise<any>;
}

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

/** Strips a trailing slash so "http://host:11434/" and "http://host:11434" both work. */
function normaliseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

/** OpenAI-style `GET /models` → `{ data: [{ id }] }`, filtered to chat models. */
function openAiStyleList(url: string, exclude: RegExp, include?: RegExp) {
  return async (key: string): Promise<ListedModel[]> => {
    const json = await getJson(url, bearer(key));
    return (json.data ?? [])
      .map((m: any) => String(m.id))
      .filter((id: string) => !exclude.test(id) && (!include || include.test(id)))
      .map((id: string) => ({ modelId: id, label: id, toolSupport: true }));
  };
}

const NON_CHAT = /embed|whisper|tts|transcribe|audio|realtime|image|dall-e|moderation|guard|rerank|search|davinci|babbage|instruct|vision-preview|playai|orpheus|imagine|video|ocr/i;

export const LLM_PROVIDERS: Record<string, ProviderDef> = {
  anthropic: {
    label: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    create: (apiKey, id) => createAnthropic({ apiKey })(id),
    listModels: async (key) => {
      const json = await getJson('https://api.anthropic.com/v1/models?limit=100', {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      });
      return (json.data ?? []).map((m: any) => ({ modelId: m.id, label: m.display_name ?? m.id, toolSupport: true }));
    },
  },
  google: {
    label: 'Gemini (Google)',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    create: (apiKey, id) => createGoogle({ apiKey })(id),
    listModels: async (key) => {
      const json = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        'x-goog-api-key': key,
      });
      return (json.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .filter((m: any) => !NON_CHAT.test(m.name) && /gemini/i.test(m.name))
        .map((m: any) => ({
          modelId: String(m.name).replace(/^models\//, ''),
          label: m.displayName ?? m.name,
          toolSupport: true,
        }));
    },
  },
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    create: (apiKey, id) => createOpenAI({ apiKey })(id),
    listModels: openAiStyleList('https://api.openai.com/v1/models', NON_CHAT, /^(gpt-|o\d|chatgpt-)/),
  },
  groq: {
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    create: (apiKey, id) => createGroq({ apiKey })(id),
    listModels: openAiStyleList('https://api.groq.com/openai/v1/models', NON_CHAT),
  },
  xai: {
    label: 'Grok (xAI)',
    keyUrl: 'https://console.x.ai',
    create: (apiKey, id) => createXai({ apiKey })(id),
    listModels: openAiStyleList('https://api.x.ai/v1/models', NON_CHAT, /grok/i),
  },
  mistral: {
    label: 'Mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    create: (apiKey, id) => createMistral({ apiKey })(id),
    listModels: async (key) => {
      const json = await getJson('https://api.mistral.ai/v1/models', bearer(key));
      const seen = new Set<string>();
      return (json.data ?? [])
        .filter((m: any) => m.capabilities?.completion_chat !== false && !NON_CHAT.test(m.id))
        .filter((m: any) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
        .map((m: any) => ({
          modelId: m.id,
          label: m.name ?? m.id,
          toolSupport: m.capabilities?.function_calling !== false,
        }));
    },
  },
  cerebras: {
    label: 'Cerebras',
    keyUrl: 'https://cloud.cerebras.ai',
    create: (apiKey, id) => createCerebras({ apiKey })(id),
    listModels: openAiStyleList('https://api.cerebras.ai/v1/models', NON_CHAT),
  },
  deepseek: {
    label: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    create: (apiKey, id) => createDeepSeek({ apiKey })(id),
    listModels: openAiStyleList('https://api.deepseek.com/models', NON_CHAT),
  },
  perplexity: {
    label: 'Perplexity',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    note: 'Perplexity models are search-oriented and do not support tool calling, so dice and HP tracking are unreliable.',
    create: (apiKey, id) => createPerplexity({ apiKey })(id),
    // Perplexity has no public model-list endpoint.
    listModels: async () =>
      ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'].map((id) => ({
        modelId: id,
        label: id,
        toolSupport: false,
      })),
  },
  openrouter: {
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/settings/keys',
    create: (apiKey, id) => createOpenRouter({ apiKey })(id),
    listModels: async (key) => {
      const json = await getJson('https://openrouter.ai/api/v1/models', bearer(key));
      return (json.data ?? [])
        .filter((m: any) => (m.architecture?.output_modalities ?? ['text']).includes('text'))
        .map((m: any) => ({
          modelId: m.id,
          label: m.name ?? m.id,
          toolSupport: (m.supported_parameters ?? []).includes('tools'),
        }));
    },
  },
  ollama: {
    label: 'Ollama (local)',
    keyUrl: 'https://ollama.com/download',
    credentialType: 'url',
    urlPlaceholder: 'http://host.docker.internal:11434',
    note:
      "Runs on your own machine — free and private, only as fast as your hardware. If Ollama runs on the Docker host (not in this container), \"localhost\" won't reach it — use http://host.docker.internal:11434 instead (already wired up in docker-compose.yml). Ollama also needs to be told to listen beyond its own machine: run it with OLLAMA_HOST=0.0.0.0 set, or it will refuse the connection even with the right address. Tool calling (dice, HP tracking) needs a model that supports it — llama3.1, qwen2.5 and mistral-nemo do; older or very small models often don't.",
    create: (baseUrl, id) => createOllama({ baseURL: `${normaliseUrl(baseUrl)}/api`, compatibility: 'strict' })(id),
    listModels: async (baseUrl) => {
      const json = await getJson(`${normaliseUrl(baseUrl)}/api/tags`);
      return (json.models ?? []).map((m: any) => ({ modelId: m.name, label: m.name, toolSupport: true }));
    },
  },
};

export function mockEnabled() {
  return process.env.TALEWEAVER_ENABLE_MOCK === '1' || process.env.TALEWEAVER_ENABLE_MOCK === 'true';
}

export const MOCK_PROVIDER: ProviderDef = {
  label: 'Mock (testing)',
  keyUrl: '',
  create: (_key, id) => createMockModel(id),
  listModels: async () => [{ modelId: 'scripted-dm', label: 'Scripted mock DM', toolSupport: true }],
};

export function providerDef(provider: string): ProviderDef | undefined {
  if (provider === 'mock') return mockEnabled() ? MOCK_PROVIDER : undefined;
  return LLM_PROVIDERS[provider];
}

/** Non-LLM services whose keys also live in the vault. */
export const OTHER_KEY_PROVIDERS: Record<string, { label: string; keyUrl: string; usedFor: string }> = {
  replicate: { label: 'Replicate', keyUrl: 'https://replicate.com/account/api-tokens', usedFor: 'Scene images (FLUX)' },
  stability: { label: 'Stability AI', keyUrl: 'https://platform.stability.ai/account/keys', usedFor: 'Scene images' },
  elevenlabs: { label: 'ElevenLabs', keyUrl: 'https://elevenlabs.io/app/settings/api-keys', usedFor: 'Narration voice' },
};
