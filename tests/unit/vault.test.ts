import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/server/db';
import { decrypt, encrypt } from '@/server/crypto';
import { getProviderKey, keyStatus, setProviderKey } from '@/server/llm/registry';

beforeEach(() => resetDbForTests());

describe('key vault', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encrypt('sk-secret-123');
    const b = encrypt('sk-secret-123');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('sk-secret-123');
  });

  it('detects tampering', () => {
    const payload = encrypt('sk-secret-123').split(':');
    payload[3] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(payload.join(':'))).toThrow();
  });

  it('stores provider keys encrypted and only exposes a hint', () => {
    setProviderKey('anthropic', '  sk-ant-abcdef123456  ');
    expect(getProviderKey('anthropic')).toBe('sk-ant-abcdef123456');
    const status = keyStatus();
    expect(status.anthropic?.hint).toBe('…3456');
    expect(JSON.stringify(status)).not.toContain('abcdef');
  });

  it('shows a url-type credential (e.g. Ollama) in full, since it is not a secret', () => {
    setProviderKey('ollama', 'http://host.docker.internal:11434');
    const status = keyStatus();
    expect(status.ollama?.hint).toBe('http://host.docker.internal:11434');
  });
});
