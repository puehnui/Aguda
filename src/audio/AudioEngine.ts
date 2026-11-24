import type { ItemCategory } from '../types';

type TrackKey = 'intro' | 'beat' | 'voMission1' | 'voCatch';

const TRACK_URLS: Record<TrackKey, string> = {
  intro: './audio/intro_transition.mp3',
  beat: './audio/beat_loop.mp3',
  voMission1: './audio/vo_mission1.mp3',
  voCatch: './audio/vo_catch.mp3',
};

const MUSIC_NORMAL_GAIN = 0.58;
const MUSIC_DUCKED_GAIN = 0.36;
const VOICE_CATCH_COOLDOWN_MS = 4500;

/**
 * WebAudio synthesizer and stem player for cinematics audio, seamless beat looping,
 * Hebrew voice cues, and procedural layered catch/mission SFX.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private readonly rawBuffers = new Map<TrackKey, ArrayBuffer>();
  private readonly decodedBuffers = new Map<TrackKey, AudioBuffer>();
  private noiseBuffer: AudioBuffer | null = null;

  private preloadPromise: Promise<void> | null = null;
  private muted = false;
  private unlocked = false;

  private cinematicsSource: AudioBufferSourceNode | null = null;
  private beatSource: AudioBufferSourceNode | null = null;
  private activeVoiceSource: AudioBufferSourceNode | null = null;

  private desiredTrack: 'cinematics' | 'beat' | null = null;
  private cinematicsAnchorMs = 0;
  private cinematicsOffsetBase = 0;
  private lastCatchVoiceMs = -Infinity;
  private duckTimer: number | null = null;

  preload(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.ensureContext();

    this.preloadPromise = Promise.all(
      (Object.keys(TRACK_URLS) as TrackKey[]).map((key) => this.fetchTrack(key, TRACK_URLS[key])),
    ).then(() => undefined);

    return this.preloadPromise;
  }

  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) {
      return false;
    }

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }

    this.unlocked = ctx.state === 'running';
    if (!this.unlocked) {
      return false;
    }

    await this.decodePendingRawBuffers();

    if (this.desiredTrack === 'cinematics' && !this.cinematicsSource) {
      const elapsedSec = Math.max(0, (performance.now() - this.cinematicsAnchorMs) / 1000);
      this.startCinematicsBuffer(this.cinematicsOffsetBase + elapsedSec);
    } else if (this.desiredTrack === 'beat' && !this.beatSource) {
      this.startBeatBuffer();
    }

    return true;
  }

  isUnlocked(): boolean {
    return this.unlocked && this.ctx?.state === 'running';
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.018);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  playCinematicsTrack(offsetSeconds = 0): void {
    this.stopGameplayBeat();
    this.desiredTrack = 'cinematics';
    this.cinematicsOffsetBase = Math.max(0, offsetSeconds);
    this.cinematicsAnchorMs = performance.now();

    if (this.isUnlocked()) {
      this.startCinematicsBuffer(this.cinematicsOffsetBase);
    }
  }

  stopCinematicsTrack(): void {
    if (this.desiredTrack === 'cinematics') {
      this.desiredTrack = null;
    }
    this.stopSource(this.cinematicsSource);
    this.cinematicsSource = null;
  }

  startGameplayBeat(): void {
    this.stopCinematicsTrack();
    this.desiredTrack = 'beat';

    if (this.isUnlocked()) {
      this.startBeatBuffer();
    }
  }

  stopGameplayBeat(): void {
    if (this.desiredTrack === 'beat') {
      this.desiredTrack = null;
    }
    this.stopSource(this.beatSource);
    this.beatSource = null;
  }

  playVoiceMission1(): void {
    this.playVoiceBuffer('voMission1');
  }

  playVoiceCatch(force = false): void {
    const nowMs = performance.now();
    if (!force && nowMs - this.lastCatchVoiceMs < VOICE_CATCH_COOLDOWN_MS) {
      return;
    }
    if (this.playVoiceBuffer('voCatch')) {
      this.lastCatchVoiceMs = nowMs;
    }
  }

  playCatchSfx(category: ItemCategory, isTarget: boolean): void {
    if (this.muted || !this.isUnlocked() || !this.ctx || !this.sfxGain) {
      return;
    }

    const now = this.ctx.currentTime;

    if (!isTarget) {
      this.synthWrongCatch(now);
      return;
    }

    if (category === 'beer') {
      this.synthBeerCatch(now);
    } else {
      this.synthSnackCatch(now);
    }
  }

  playMissionComplete(): void {
    if (this.muted || !this.isUnlocked() || !this.ctx || !this.sfxGain) {
      return;
    }

    const ctx = this.ctx;
    const out = this.sfxGain;
    const now = ctx.currentTime;

    // Warm celebratory Cmaj9 arpeggio with soft shimmer tail
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);

      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + 0.58);
    });

    // Subtle warm bass bloom underneath
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130.81, now);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.16, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    subOsc.connect(subGain);
    subGain.connect(out);
    subOsc.start(now);
    subOsc.stop(now + 0.58);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }

    try {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      master.connect(ctx.destination);

      const music = ctx.createGain();
      music.gain.value = MUSIC_NORMAL_GAIN;
      music.connect(master);

      const voice = ctx.createGain();
      voice.gain.value = 0.96;
      voice.connect(master);

      const sfx = ctx.createGain();
      sfx.gain.value = 0.82;
      sfx.connect(master);

      this.ctx = ctx;
      this.masterGain = master;
      this.musicGain = music;
      this.voiceGain = voice;
      this.sfxGain = sfx;
      this.unlocked = ctx.state === 'running';
      return ctx;
    } catch {
      return null;
    }
  }

  private async fetchTrack(key: TrackKey, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        return;
      }
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 64) {
        return;
      }
      this.rawBuffers.set(key, buffer);
      await this.decodeBuffer(key, buffer);
    } catch {
      // Gracefully tolerate missing/unready audio files; procedural SFX still works
    }
  }

  private async decodePendingRawBuffers(): Promise<void> {
    const tasks: Array<Promise<void>> = [];
    for (const [key, raw] of this.rawBuffers.entries()) {
      if (!this.decodedBuffers.has(key)) {
        tasks.push(this.decodeBuffer(key, raw));
      }
    }
    await Promise.all(tasks);
  }

  private async decodeBuffer(key: TrackKey, raw: ArrayBuffer): Promise<void> {
    if (!this.ctx || this.decodedBuffers.has(key)) {
      return;
    }
    try {
      // Clone ArrayBuffer so decodeAudioData detaching does not invalidate retries
      const decoded = await this.ctx.decodeAudioData(raw.slice(0));
      this.decodedBuffers.set(key, decoded);
    } catch {
      // Ignore malformed or unsupported audio chunks cleanly
    }
  }

  private startCinematicsBuffer(offsetSeconds: number): void {
    const buffer = this.decodedBuffers.get('intro');
    if (!buffer || !this.ctx || !this.musicGain) {
      return;
    }

    if (offsetSeconds >= buffer.duration - 0.05) {
      return;
    }

    this.stopSource(this.cinematicsSource);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(this.musicGain);
    source.onended = () => {
      if (this.cinematicsSource === source) {
        this.cinematicsSource = null;
      }
    };
    source.start(0, Math.max(0, offsetSeconds));
    this.cinematicsSource = source;
  }

  private startBeatBuffer(): void {
    if (this.beatSource) {
      return;
    }
    const buffer = this.decodedBuffers.get('beat');
    if (!buffer || !this.ctx || !this.musicGain) {
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;

    const fadeGain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    fadeGain.gain.setValueAtTime(0.0001, now);
    fadeGain.gain.linearRampToValueAtTime(1, now + 0.04);

    source.connect(fadeGain);
    fadeGain.connect(this.musicGain);
    source.start(0);
    this.beatSource = source;
  }

  private playVoiceBuffer(key: 'voMission1' | 'voCatch'): boolean {
    if (!this.isUnlocked() || !this.ctx || !this.voiceGain) {
      return false;
    }
    const buffer = this.decodedBuffers.get(key);
    if (!buffer) {
      return false;
    }

    this.stopSource(this.activeVoiceSource);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.voiceGain);
    source.onended = () => {
      if (this.activeVoiceSource === source) {
        this.activeVoiceSource = null;
      }
    };
    source.start(0);
    this.activeVoiceSource = source;

    this.duckMusicFor(buffer.duration * 1000);
    return true;
  }

  private duckMusicFor(durationMs: number): void {
    if (!this.ctx || !this.musicGain) {
      return;
    }

    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(MUSIC_DUCKED_GAIN, now, 0.05);

    if (this.duckTimer !== null) {
      window.clearTimeout(this.duckTimer);
    }

    this.duckTimer = window.setTimeout(() => {
      this.duckTimer = null;
      if (this.ctx && this.musicGain) {
        const t = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(t);
        this.musicGain.gain.setTargetAtTime(MUSIC_NORMAL_GAIN, t, 0.14);
      }
    }, Math.max(400, durationMs));
  }

  private stopSource(source: AudioBufferSourceNode | null): void {
    if (!source) {
      return;
    }
    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch {
      // Source may already be stopped
    }
  }

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) {
      return null;
    }
    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private synthBeerCatch(now: number): void {
    if (!this.ctx || !this.sfxGain) {
      return;
    }
    const ctx = this.ctx;
    const out = this.sfxGain;

    // 1. Crisp glass bottle clink partials
    const partials: Array<[number, number, number]> = [
      [2380, 0.14, 0.11],
      [3860, 0.1, 0.085],
      [5180, 0.05, 0.055],
    ];
    for (const [freq, peak, decay] of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.02);
    }

    // 2. Subtle high-frequency sparkle fizz
    this.triggerFilteredNoise(now, 3400, 1.4, 0.04, 0.05, 'highpass');

    // 3. Bright harmonic chime
    const chimeNotes = [1046.5, 1318.51];
    chimeNotes.forEach((freq, idx) => {
      const t = now + idx * 0.032;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  private synthSnackCatch(now: number): void {
    if (!this.ctx || !this.sfxGain) {
      return;
    }
    const ctx = this.ctx;
    const out = this.sfxGain;

    // 1. Crinkly foil bag rustle (two rapid bandpassed bursts)
    this.triggerFilteredNoise(now, 2700, 2.2, 0.11, 0.06, 'bandpass');
    this.triggerFilteredNoise(now + 0.038, 4300, 2.6, 0.09, 0.055, 'bandpass');

    // 2. Low burlap sack thump
    const thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(125, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(56, now + 0.09);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(0.18, now + 0.006);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(out);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.13);

    // 3. Bright chime accent
    const chimeNotes = [783.99, 1174.66];
    chimeNotes.forEach((freq, idx) => {
      const t = now + idx * 0.028;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.085, t + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }

  private synthWrongCatch(now: number): void {
    if (!this.ctx || !this.sfxGain) {
      return;
    }
    const ctx = this.ctx;
    const out = this.sfxGain;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  private triggerFilteredNoise(
    startTime: number,
    frequency: number,
    q: number,
    peakGain: number,
    decaySec: number,
    filterType: BiquadFilterType,
  ): void {
    const noise = this.getNoiseBuffer();
    if (!noise || !this.ctx || !this.sfxGain) {
      return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = noise;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decaySec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(startTime);
    src.stop(startTime + decaySec + 0.02);
  }
}
