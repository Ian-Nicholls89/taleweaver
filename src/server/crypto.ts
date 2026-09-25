import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './db';

let cachedSecret: string | undefined;

/**
 * APP_SECRET encrypts provider API keys at rest. In production it must be set;
 * in development a random one is generated and kept in data/dev-secret so keys
 * survive restarts.
 */
export function appSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error('APP_SECRET must be at least 32 characters');
    return (cachedSecret = fromEnv);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_SECRET is not set. Generate one with: openssl rand -base64 48');
  }
  const dir = dataDir() === ':memory:' ? null : dataDir();
  if (!dir) return (cachedSecret = 'insecure-test-secret-insecure-test-secret');
  const file = path.join(dir, 'dev-secret');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(48).toString('base64'), { mode: 0o600 });
    console.warn('[taleweaver] APP_SECRET not set; generated a development secret in', file);
  }
  return (cachedSecret = fs.readFileSync(file, 'utf8').trim());
}

function vaultKey() {
  return crypto.hkdfSync('sha256', appSecret(), 'taleweaver', 'key-vault-v1', 32) as ArrayBuffer;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(vaultKey()), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(vaultKey()), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function newId() {
  return crypto.randomUUID();
}
