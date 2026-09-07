import { describe, expect, it } from 'vitest';
import type { CombatEvent, CombatEventKind } from '../types/game';
import type { SoundId } from '../types/audio';
import { AudioManager } from './AudioManager';
import { DEFAULT_AUDIO_SETTINGS } from './audioConfig';
import { soundForCombatEvent } from './combatEventAudio';

function event(kind: CombatEventKind, details: Partial<CombatEvent> = {}): CombatEvent {
  return { id: 1, kind, message: kind, ...details };
}

describe('combat event audio mapping', () => {
  it.each([
    ['warrior', 'warrior_attack'],
    ['mage', 'mage_attack'],
    ['cleric', 'cleric_attack'],
    ['martial-artist', 'martial_artist_attack'],
  ] as const)('maps %s attacks to a distinct sound', (characterId, expected) => {
    expect(soundForCombatEvent(event('ally-attack', { actorId: characterId }))).toBe(expected);
  });

  it.each([
    ['ally-damaged', 'ally_damage'],
    ['ally-heal', 'ally_heal'],
    ['ally-buff', 'ally_buff'],
    ['ally-debuff', 'ally_debuff'],
    ['ally-guard-consumed', 'warrior_guard'],
    ['enemy-heal', 'enemy_heal'],
    ['enemy-buff', 'enemy_buff'],
    ['enemy-special-ready', 'enemy_special_warning'],
    ['ally-defeated', 'ally_defeated'],
    ['enemy-defeated', 'enemy_defeated'],
    ['typing-correct', 'typing_correct'],
    ['typing-miss', 'typing_miss'],
    ['victory', 'victory'],
    ['defeat', 'game_over'],
  ] as const)('maps %s to %s', (kind, expected: SoundId) => {
    expect(soundForCombatEvent(event(kind))).toBe(expected);
  });

  it('uses an ability-specific sound before the effect fallback', () => {
    expect(soundForCombatEvent(event('enemy-special-used', {
      effectType: 'heal',
      soundId: 'enemy_special_damage',
    }))).toBe('enemy_special_damage');
    expect(soundForCombatEvent(event('enemy-special-used', { effectType: 'debuff' })))
      .toBe('enemy_special_debuff');
  });
});

describe('AudioManager settings', () => {
  it('applies volume changes and mute immediately', () => {
    const manager = new AudioManager();
    manager.setSettings({ ...DEFAULT_AUDIO_SETTINGS, masterVolume: .5, combatSeVolume: .4 });
    expect(manager.getEffectiveVolume('ally_damage')).toBeCloseTo(.82 * .5 * .4);
    manager.setSettings({ ...manager.getSettings(), combatSeMuted: true });
    expect(manager.getEffectiveVolume('ally_damage')).toBe(0);
    expect(manager.getEffectiveVolume('typing_correct')).toBeGreaterThan(0);
  });

  it('clamps invalid volume values', () => {
    const manager = new AudioManager();
    manager.setSettings({ ...DEFAULT_AUDIO_SETTINGS, masterVolume: 3, typingSeVolume: -1 });
    expect(manager.getSettings().masterVolume).toBe(1);
    expect(manager.getSettings().typingSeVolume).toBe(0);
  });

  it('fails quietly when browser audio APIs are unavailable', async () => {
    const manager = new AudioManager();
    await expect(manager.unlock()).resolves.toBe(false);
    expect(() => manager.play('warrior_attack')).not.toThrow();
    expect(manager.play('warrior_attack')).toBe(false);
  });
});
