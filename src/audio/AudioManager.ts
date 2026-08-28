import { DEFAULT_AUDIO_SETTINGS, SOUND_DEFINITIONS, type SoundDefinition } from './audioConfig';
import type { AudioChannel, AudioSettings, SoundId } from '../types/audio';

type SettingsListener = (settings: AudioSettings) => void;

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class AudioManager {
  private context: AudioContext | null = null;
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
  private readonly listeners = new Set<SettingsListener>();
  private readonly lastPlayedAt = new Map<SoundId, number>();
  private readonly activeVoices = new Map<SoundId, number>();
  private typingSuppressedUntil = 0;

  getSettings(): AudioSettings {
    return this.settings;
  }

  setSettings(settings: AudioSettings): void {
    this.settings = {
      ...settings,
      masterVolume: clampVolume(settings.masterVolume),
      bgmVolume: clampVolume(settings.bgmVolume),
      combatSeVolume: clampVolume(settings.combatSeVolume),
      typingSeVolume: clampVolume(settings.typingSeVolume),
      uiSeVolume: clampVolume(settings.uiSeVolume),
    };
    this.listeners.forEach((listener) => listener(this.settings));
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEffectiveVolume(soundId: SoundId): number {
    const definition = SOUND_DEFINITIONS[soundId];
    if (this.channelMuted(definition.channel)) return 0;
    return definition.baseVolume * this.settings.masterVolume * this.channelVolume(definition.channel);
  }

  async unlock(): Promise<boolean> {
    try {
      const context = this.getOrCreateContext();
      if (!context) return false;
      if (context.state === 'suspended') await context.resume();
      return context.state === 'running';
    } catch {
      return false;
    }
  }

  play(soundId: SoundId): boolean {
    const definition = SOUND_DEFINITIONS[soundId];
    const now = performance.now();
    if (this.channelMuted(definition.channel) || this.channelVolume(definition.channel) <= 0) return false;
    if (definition.channel === 'typing' && now < this.typingSuppressedUntil) return false;
    if (now - (this.lastPlayedAt.get(soundId) ?? -Infinity) < definition.cooldownMs) return false;
    if ((this.activeVoices.get(soundId) ?? 0) >= definition.maxVoices) return false;

    const volume = this.getEffectiveVolume(soundId);
    if (volume <= 0) return false;
    if (definition.priority >= 2 && definition.channel === 'combat') this.typingSuppressedUntil = now + 140;

    const started = definition.src
      ? this.playAudioFile(soundId, definition, volume)
      : this.playSynth(soundId, definition, volume);
    if (started) this.lastPlayedAt.set(soundId, now);
    return started;
  }

  private getOrCreateContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined') return null;
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    try {
      this.context = new Context();
    } catch {
      return null;
    }
    return this.context;
  }

  private playSynth(soundId: SoundId, definition: SoundDefinition, volume: number): boolean {
    const context = this.getOrCreateContext();
    if (!context || context.state !== 'running') return false;
    const start = context.currentTime;
    let endTime = start;
    this.incrementVoice(soundId);

    for (const tone of definition.notes) {
      const toneStart = start + (tone.offset ?? 0);
      const toneEnd = toneStart + tone.duration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.wave ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
      if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, toneEnd);
      gain.gain.setValueAtTime(.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001, tone.gain * volume), toneStart + Math.min(.008, tone.duration / 3));
      gain.gain.exponentialRampToValueAtTime(.0001, toneEnd);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + .01);
      endTime = Math.max(endTime, toneEnd);
    }

    if (definition.noise) {
      const noise = definition.noise;
      const noiseStart = start + (noise.offset ?? 0);
      const noiseEnd = noiseStart + noise.duration;
      const frameCount = Math.ceil(context.sampleRate * noise.duration);
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = noise.lowpassHz ?? 1600;
      gain.gain.setValueAtTime(noise.gain * volume, noiseStart);
      gain.gain.exponentialRampToValueAtTime(.0001, noiseEnd);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start(noiseStart);
      source.stop(noiseEnd + .01);
      endTime = Math.max(endTime, noiseEnd);
    }

    window.setTimeout(() => this.decrementVoice(soundId), Math.max(20, (endTime - start) * 1000 + 30));
    return true;
  }

  private playAudioFile(soundId: SoundId, definition: SoundDefinition, volume: number): boolean {
    if (!definition.src || typeof Audio === 'undefined') return false;
    const audio = new Audio(definition.src);
    audio.volume = clampVolume(volume);
    this.incrementVoice(soundId);
    const release = () => this.decrementVoice(soundId);
    audio.addEventListener('ended', release, { once: true });
    audio.addEventListener('error', release, { once: true });
    void audio.play().catch(release);
    return true;
  }

  private channelVolume(channel: AudioChannel): number {
    if (channel === 'bgm') return this.settings.bgmVolume;
    if (channel === 'combat') return this.settings.combatSeVolume;
    if (channel === 'typing') return this.settings.typingSeVolume;
    return this.settings.uiSeVolume;
  }

  private channelMuted(channel: AudioChannel): boolean {
    if (this.settings.masterMuted) return true;
    if (channel === 'bgm') return this.settings.bgmMuted;
    if (channel === 'combat') return this.settings.combatSeMuted;
    if (channel === 'typing') return this.settings.typingSeMuted;
    return this.settings.uiSeMuted;
  }

  private incrementVoice(soundId: SoundId): void {
    this.activeVoices.set(soundId, (this.activeVoices.get(soundId) ?? 0) + 1);
  }

  private decrementVoice(soundId: SoundId): void {
    this.activeVoices.set(soundId, Math.max(0, (this.activeVoices.get(soundId) ?? 1) - 1));
  }
}

export const audioManager = new AudioManager();
