import fs from 'node:fs';
import path from 'node:path';
import { generateSpeech } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { mediaDir } from '../db';
import { sha256 } from '../crypto';
import { getProviderKey } from '../llm/registry';
import { getSetting } from '../settings';

export class TtsUnavailableError extends Error {}

function cleanForSpeech(text: string) {
  return text
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

/** Server-side narration. Returns an mp3, cached on disk by text + voice. */
export async function synthesise(text: string): Promise<{ file: string; mime: string }> {
  const s = getSetting('tts');
  if (s.provider === 'browser') throw new TtsUnavailableError('Server narration is off; the browser voice is used instead.');
  const clean = cleanForSpeech(text);
  if (!clean) throw new TtsUnavailableError('Nothing to read');

  const dir = path.join(/*turbopackIgnore: true*/ mediaDir(), 'tts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sha256(`${s.provider}|${s.model}|${s.voice}|${clean}`)}.mp3`);
  if (fs.existsSync(file)) return { file, mime: 'audio/mpeg' };

  let audio: Uint8Array;
  if (s.provider === 'openai') {
    const key = getProviderKey('openai');
    if (!key) throw new TtsUnavailableError('No OpenAI key saved');
    const openai = createOpenAI({ apiKey: key });
    const result = await generateSpeech({
      model: openai.speech(s.model || 'gpt-4o-mini-tts'),
      text: clean,
      voice: s.voice || 'onyx',
      instructions: 'Narrate like a warm, dramatic fantasy storyteller. Vary the pace for tension; give characters subtle voices.',
      outputFormat: 'mp3',
    });
    audio = result.audio.uint8Array;
  } else {
    const key = getProviderKey('elevenlabs');
    if (!key) throw new TtsUnavailableError('No ElevenLabs key saved');
    const voice = s.voice || 'JBFqnCBsd6RMkjVDRZzb'; // "George" — a default ElevenLabs narrator voice
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: clean, model_id: s.model || 'eleven_multilingual_v2' }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    audio = new Uint8Array(await res.arrayBuffer());
  }
  fs.writeFileSync(file, audio);
  return { file, mime: 'audio/mpeg' };
}
