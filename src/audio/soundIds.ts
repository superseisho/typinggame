import type { SoundId } from '../types/audio';

export const SOUND_IDS = {
  warriorAttack: 'warrior_attack',
  mageAttack: 'mage_attack',
  clericAttack: 'cleric_attack',
  martialArtistAttack: 'martial_artist_attack',
  allyDamage: 'ally_damage',
  allyHeal: 'ally_heal',
  allyBuff: 'ally_buff',
  allyDebuff: 'ally_debuff',
  enemyHeal: 'enemy_heal',
  enemyBuff: 'enemy_buff',
  enemyDebuff: 'enemy_debuff',
  specialWarning: 'enemy_special_warning',
  allyDefeated: 'ally_defeated',
  enemyDefeated: 'enemy_defeated',
  typingCorrect: 'typing_correct',
  typingMiss: 'typing_miss',
  victory: 'victory',
  gameOver: 'game_over',
  uiConfirm: 'ui_confirm',
} as const satisfies Record<string, SoundId>;
