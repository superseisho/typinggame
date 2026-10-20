import type { CharacterArtSet, CharacterDefinition } from '../types/game';
import { indexById } from '../utils/indexById';
import { TRANSIENT_ABILITY_VISUAL_MS } from './gameConfig';

function createArtSet(characterFolder: string, abilityFileName: string): CharacterArtSet {
  const path = (fileName: string) =>
  `${import.meta.env.BASE_URL}images/characters/${characterFolder}/${fileName}.png`;
  return {
    normal: path('normal'),
    lowHp: path('low-hp'),
    damaged: path('damaged'),
    lowHpDamaged: path('low-hp-damaged'),
    down: path('down'),
    abilityActive: path(`${abilityFileName}-active`),
    lowHpAbilityActive: path(`low-hp-${abilityFileName}-active`),
  };
}

export const CHARACTER_DEFINITIONS = [
  {
    id: 'warrior',
    name: '騎士',
    englishName: 'Knight',
    role: 'tank',
    roleLabel: 'DEFENDER',
    portraitGlyph: 'W',
    accentColor: '#d4a45f',
    art: createArtSet('warrior', 'guard'),
    stats: { maxHp: 180, attack: 31, defense: 9 },
    attackThreshold: 90,
    attackElement: 'physical',
    targetRule: 'frontmost',
    audio: { attack: 'warrior_attack', ability: 'warrior_guard' },
    ability: {
      id: 'guard',
      name: 'GUARD',
      description: '文章を3回完成すると、次の敵攻撃を防ぐ。',
      trigger: { type: 'completed-prompts', threshold: 3 },
      effects: [{ type: 'guard-next-hit' }],
      visual: { kind: 'guard', persistence: 'persistent' },
      soundId: 'warrior_guard',
    },
  },
  {
    id: 'mage',
    name: '魔法使い',
    englishName: 'Mage',
    role: 'magic-dps',
    roleLabel: 'ARCANE DPS',
    portraitGlyph: 'M',
    accentColor: '#a58bff',
    art: createArtSet('mage', 'cast'),
    stats: { maxHp: 120, attack: 23, defense: 2 },
    attackThreshold: 30,
    attackElement: 'fire',
    targetRule: 'lowest-hp',
    audio: { attack: 'mage_attack', ability: 'mage_focus' },
    ability: {
      id: 'arcane-burst',
      name: 'ARCANE BURST',
      description: '正しく30文字入力すると、敵全体へ魔法攻撃を放つ。',
      trigger: { type: 'correct-characters', threshold: 30 },
      effects: [{ type: 'damage-all-enemies', power: 24 }],
      visual: { kind: 'cast', persistence: 'instant', displayMs: TRANSIENT_ABILITY_VISUAL_MS },
      soundId: 'mage_focus',
    },
  },
  {
    id: 'cleric',
    name: '僧侶',
    englishName: 'Cleric',
    role: 'healer',
    roleLabel: 'HEALER',
    portraitGlyph: 'C',
    accentColor: '#79d6be',
    art: createArtSet('cleric', 'heal'),
    stats: { maxHp: 125, attack: 16, defense: 5 },
    attackThreshold: 70,
    attackElement: 'holy',
    targetRule: 'frontmost',
    audio: { attack: 'cleric_attack', ability: 'cleric_heal' },
    ability: {
      id: 'heal',
      name: 'HEAL',
      description: '正しく50文字入力すると、最も傷ついた味方を回復する。',
      trigger: { type: 'correct-characters', threshold: 50 },
      effects: [{ type: 'heal-lowest-ally', power: 50 }],
      visual: { kind: 'heal', persistence: 'instant', displayMs: TRANSIENT_ABILITY_VISUAL_MS },
      soundId: 'cleric_heal',
    },
  },
  {
    id: 'martial-artist',
    name: '武闘家',
    englishName: 'Martial Artist',
    role: 'combo-dps',
    roleLabel: 'COMBO DPS',
    portraitGlyph: 'F',
    accentColor: '#e47b70',
    art: createArtSet('martial-artist', 'combo'),
    stats: { maxHp: 142, attack: 25, defense: 4 },
    attackThreshold: 50,
    attackElement: 'physical',
    targetRule: 'lowest-hp',
    audio: { attack: 'martial_artist_attack', ability: 'martial_artist_combo' },
    ability: {
      id: 'flow-combo',
      name: 'FLOW COMBO',
      description: 'ノーミス連続入力で攻撃倍率が上昇する。',
      trigger: { type: 'combo-milestones', thresholds: [20, 40, 80] },
      effects: [{ type: 'combo-attack-scaling', multipliers: [1.1, 1.25, 1.5] }],
      visual: { kind: 'combo', persistence: 'persistent' },
      soundId: 'martial_artist_combo',
    },
  },
] as const satisfies readonly CharacterDefinition[];

export const CHARACTERS_BY_ID = indexById(CHARACTER_DEFINITIONS);
