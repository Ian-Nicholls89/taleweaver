'use client';

/** Reads DM narration aloud, using the browser's voices or the server's TTS. */
export class Narrator {
  private audio: HTMLAudioElement | null = null;
  private abort: AbortController | null = null;
  onSpeakingChange?: (speaking: boolean) => void;

  constructor(
    private mode: 'browser' | 'server',
    private voiceName?: string,
  ) {}

  setVoice(name?: string) {
    this.voiceName = name;
  }

  static browserVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  }

  stop() {
    this.abort?.abort();
    this.abort = null;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.onSpeakingChange?.(false);
  }

  async speak(text: string) {
    this.stop();
    const clean = text
      .replace(/[*_#>`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;
    if (this.mode === 'browser') return this.speakBrowser(clean);
    try {
      this.abort = new AbortController();
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
        signal: this.abort.signal,
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      this.audio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.onSpeakingChange?.(false);
      };
      this.onSpeakingChange?.(true);
      await audio.play();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Fall back to the browser voice if the server voice fails.
      this.speakBrowser(clean);
    }
  }

  private speakBrowser(text: string) {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    // Long texts are split into sentences; some browsers stop speaking after ~15 seconds of one utterance.
    const chunks = text.match(/[^.!?]+[.!?]+["”’]?\s*|[^.!?]+$/g) ?? [text];
    const voice = Narrator.browserVoices().find((v) => v.name === this.voiceName);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      if (voice) u.voice = voice;
      u.rate = 0.97;
      u.pitch = 0.95;
      if (i === 0) u.onstart = () => this.onSpeakingChange?.(true);
      if (i === chunks.length - 1) u.onend = () => this.onSpeakingChange?.(false);
      synth.speak(u);
    });
  }
}
