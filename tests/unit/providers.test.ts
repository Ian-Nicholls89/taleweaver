import { describe, expect, it } from 'vitest';
import { LLM_PROVIDERS } from '@/server/llm/providers';

describe('provider registry', () => {
  it('lists every provider with a create() and listModels() function', () => {
    for (const [id, p] of Object.entries(LLM_PROVIDERS)) {
      expect(typeof p.create, id).toBe('function');
      expect(typeof p.listModels, id).toBe('function');
      expect(p.label.length, id).toBeGreaterThan(0);
    }
  });

  it('ollama is url-credentialed and builds a model without touching the network', () => {
    const ollama = LLM_PROVIDERS.ollama!;
    expect(ollama.credentialType).toBe('url');
    // create() just builds a provider/model object — it shouldn't make a request itself.
    const model = ollama.create('http://host.docker.internal:11434/', 'llama3.1');
    expect(typeof model).toBe('object');
    expect((model as { modelId: string }).modelId).toBe('llama3.1');
  });

  it('every other provider defaults to an api-key credential', () => {
    for (const [id, p] of Object.entries(LLM_PROVIDERS)) {
      if (id === 'ollama') continue;
      expect(p.credentialType ?? 'apiKey', id).toBe('apiKey');
    }
  });
});
