import type { AudioChannel, AudioSettings, SoundId } from '../types/audio';

export interface SynthNote {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly offset?: number;
  readonly duration: number;
  readonly gain: number;
  readonly wave?: OscillatorType;
}

export interface NoiseBurst {
  readonly offset?: number;
  readonly duration: number;
  readonly gain: number;
  readonly lowpassHz?: number;
}

export interface SoundDefinition {
  readonly channel: AudioChannel;
  readonly baseVolume: number;
  readonly cooldownMs: number;
  readonly maxVoices: number;
  readonly priority: 1 | 2 | 3;
  readonly src?: string;
  readonly notes: readonly SynthNote[];
  readonly noise?: NoiseBurst;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  bgmVolume: 0.65,
  combatSeVolume: 0.85,
  typingSeVolume: 0.22,
  uiSeVolume: 0.55,
  masterMuted: false,
  bgmMuted: false,
  combatSeMuted: false,
  typingSeMuted: false,
  uiSeMuted: false,
};

const note = (frequency: number, offset: number, duration: number, gain: number, wave: OscillatorType = 'sine', endFrequency?: number): SynthNote =>
  ({ frequency, offset, duration, gain, wave, endFrequency });

export const SOUND_DEFINITIONS: Readonly<Record<SoundId, SoundDefinition>> = {
  warrior_attack: { channel: 'combat', baseVolume: .72, cooldownMs: 90, maxVoices: 2, priority: 2, notes: [note(190, 0, .11, .25, 'square', 115), note(980, .02, .07, .08, 'triangle', 620)], noise: { duration: .09, gain: .18, lowpassHz: 2600 } },
  mage_attack: { channel: 'combat', baseVolume: .62, cooldownMs: 75, maxVoices: 3, priority: 2, notes: [note(540, 0, .15, .2, 'sine', 1120), note(810, .035, .16, .11, 'sine', 1480)] },
  cleric_attack: { channel: 'combat', baseVolume: .58, cooldownMs: 100, maxVoices: 2, priority: 2, notes: [note(740, 0, .18, .18, 'sine'), note(1110, .035, .22, .12, 'sine')] },
  martial_artist_attack: { channel: 'combat', baseVolume: .68, cooldownMs: 55, maxVoices: 3, priority: 2, notes: [note(130, 0, .055, .28, 'square', 82)], noise: { duration: .045, gain: .23, lowpassHz: 900 } },
  warrior_guard: { channel: 'combat', baseVolume: .7, cooldownMs: 200, maxVoices: 1, priority: 2, notes: [note(240, 0, .2, .2, 'triangle'), note(480, .03, .22, .1, 'sine')] },
  mage_focus: { channel: 'combat', baseVolume: .62, cooldownMs: 200, maxVoices: 1, priority: 2, notes: [note(420, 0, .13, .13), note(650, .09, .14, .14), note(980, .18, .18, .14)] },
  cleric_heal: { channel: 'combat', baseVolume: .72, cooldownMs: 160, maxVoices: 2, priority: 3, notes: [note(520, 0, .18, .14), note(720, .09, .22, .14), note(1040, .19, .28, .13)] },
  martial_artist_combo: { channel: 'combat', baseVolume: .62, cooldownMs: 120, maxVoices: 2, priority: 2, notes: [note(220, 0, .06, .2, 'square'), note(330, .06, .06, .18, 'square'), note(495, .12, .08, .16, 'square')] },
  ally_damage: { channel: 'combat', baseVolume: .82, cooldownMs: 70, maxVoices: 3, priority: 3, notes: [note(125, 0, .16, .28, 'sawtooth', 62)], noise: { duration: .11, gain: .22, lowpassHz: 700 } },
  ally_heal: { channel: 'combat', baseVolume: .72, cooldownMs: 150, maxVoices: 2, priority: 3, notes: [note(560, 0, .18, .15), note(760, .08, .2, .14), note(1080, .17, .26, .12)] },
  ally_buff: { channel: 'combat', baseVolume: .7, cooldownMs: 160, maxVoices: 2, priority: 3, notes: [note(260, 0, .12, .14, 'triangle'), note(390, .08, .14, .16, 'triangle'), note(590, .16, .2, .16, 'triangle')] },
  ally_debuff: { channel: 'combat', baseVolume: .78, cooldownMs: 180, maxVoices: 2, priority: 3, notes: [note(390, 0, .13, .17, 'sawtooth'), note(235, .1, .16, .18, 'sawtooth'), note(105, .22, .24, .16, 'sawtooth')] },
  enemy_heal: { channel: 'combat', baseVolume: .72, cooldownMs: 160, maxVoices: 2, priority: 2, notes: [note(285, 0, .18, .16, 'triangle'), note(360, .1, .2, .15, 'triangle'), note(455, .2, .24, .14, 'triangle')] },
  enemy_buff: { channel: 'combat', baseVolume: .76, cooldownMs: 180, maxVoices: 2, priority: 2, notes: [note(105, 0, .18, .2, 'square'), note(158, .09, .2, .18, 'square'), note(215, .18, .25, .16, 'square')] },
  enemy_debuff: { channel: 'combat', baseVolume: .78, cooldownMs: 180, maxVoices: 2, priority: 3, notes: [note(330, 0, .16, .17, 'sawtooth', 170), note(155, .14, .25, .16, 'sawtooth', 72)] },
  enemy_special_warning: { channel: 'combat', baseVolume: .9, cooldownMs: 300, maxVoices: 2, priority: 3, notes: [note(880, 0, .11, .2, 'square'), note(660, .15, .11, .22, 'square'), note(880, .3, .16, .22, 'square')] },
  enemy_special_damage: { channel: 'combat', baseVolume: .86, cooldownMs: 180, maxVoices: 2, priority: 3, notes: [note(170, 0, .28, .28, 'sawtooth', 55)], noise: { duration: .25, gain: .2, lowpassHz: 1100 } },
  enemy_special_heal: { channel: 'combat', baseVolume: .7, cooldownMs: 180, maxVoices: 2, priority: 2, notes: [note(220, 0, .2, .15, 'triangle'), note(330, .1, .23, .14, 'triangle'), note(440, .22, .28, .13, 'triangle')] },
  enemy_special_buff: { channel: 'combat', baseVolume: .78, cooldownMs: 180, maxVoices: 2, priority: 3, notes: [note(90, 0, .22, .22, 'square'), note(135, .13, .28, .2, 'square')] },
  enemy_special_debuff: { channel: 'combat', baseVolume: .8, cooldownMs: 180, maxVoices: 2, priority: 3, notes: [note(360, 0, .2, .18, 'sawtooth', 130), note(120, .18, .3, .17, 'sawtooth', 50)] },
  enemy_defeated: { channel: 'combat', baseVolume: .72, cooldownMs: 80, maxVoices: 3, priority: 2, notes: [note(340, 0, .08, .18, 'square', 180), note(150, .07, .14, .17, 'triangle', 72)] },
  ally_defeated: { channel: 'combat', baseVolume: .88, cooldownMs: 250, maxVoices: 2, priority: 3, notes: [note(260, 0, .22, .2, 'sawtooth'), note(155, .19, .28, .2, 'sawtooth'), note(72, .43, .35, .17, 'sawtooth')] },
  typing_correct: { channel: 'typing', baseVolume: .22, cooldownMs: 14, maxVoices: 2, priority: 1, notes: [note(920, 0, .022, .08, 'sine')] },
  typing_miss: { channel: 'typing', baseVolume: .48, cooldownMs: 85, maxVoices: 1, priority: 1, notes: [note(190, 0, .065, .15, 'square', 130)] },
  victory: { channel: 'combat', baseVolume: .85, cooldownMs: 800, maxVoices: 1, priority: 3, notes: [note(392, 0, .2, .15), note(523, .16, .22, .16), note(659, .32, .25, .17), note(784, .51, .5, .18)] },
  game_over: { channel: 'combat', baseVolume: .9, cooldownMs: 800, maxVoices: 1, priority: 3, notes: [note(294, 0, .3, .17, 'triangle'), note(220, .26, .35, .18, 'triangle'), note(147, .57, .55, .19, 'triangle')] },
  ui_confirm: { channel: 'ui', baseVolume: .45, cooldownMs: 80, maxVoices: 2, priority: 1, notes: [note(520, 0, .055, .11), note(780, .04, .08, .09)] },
};
