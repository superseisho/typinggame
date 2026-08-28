export type AudioChannel = 'bgm' | 'combat' | 'typing' | 'ui';

export type SoundId =
  | 'warrior_attack'
  | 'mage_attack'
  | 'cleric_attack'
  | 'martial_artist_attack'
  | 'warrior_guard'
  | 'mage_focus'
  | 'cleric_heal'
  | 'martial_artist_combo'
  | 'ally_damage'
  | 'ally_heal'
  | 'ally_buff'
  | 'ally_debuff'
  | 'enemy_heal'
  | 'enemy_buff'
  | 'enemy_debuff'
  | 'enemy_special_warning'
  | 'enemy_special_damage'
  | 'enemy_special_heal'
  | 'enemy_special_buff'
  | 'enemy_special_debuff'
  | 'enemy_defeated'
  | 'ally_defeated'
  | 'typing_correct'
  | 'typing_miss'
  | 'victory'
  | 'game_over'
  | 'ui_confirm';

export interface AudioSettings {
  readonly masterVolume: number;
  readonly bgmVolume: number;
  readonly combatSeVolume: number;
  readonly typingSeVolume: number;
  readonly uiSeVolume: number;
  readonly masterMuted: boolean;
  readonly bgmMuted: boolean;
  readonly combatSeMuted: boolean;
  readonly typingSeMuted: boolean;
  readonly uiSeMuted: boolean;
}
