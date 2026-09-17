import type { EnemyDefinition } from '../types/game';
import { indexById } from '../utils/indexById';
import { ENEMY_SKILL_CONFIG as SKILL } from './enemySkills';

export const ENEMY_DEFINITIONS = [
  {
    id: 'crypt-slime',
    skills: [{ skillId: 'skill_attack', weight: SKILL.attackWeight, actionTimeMs: 5000 }],
    name: '墓所のスライム',
    englishName: 'Crypt Slime',
    maxHp: 150,
    attack: 19,
    defense: 3,
    specialGaugeMax: 100,
    specialAbilities: [{
      id: 'corrosive-burst',
      name: '腐蝕の奔流',
      description: 'パーティー全体へ腐蝕ダメージを与える。',
      gaugeCost: 100,
      effects: [{ effectType: 'damage', targetType: 'allParty', value: 18, valueType: 'flat' }],
      soundId: 'enemy_special_damage',
    }],
    aiRules: [{ abilityId: 'corrosive-burst', priority: 1, condition: { type: 'always' } }],
    rewards: { gold: [18, 30], experience: 12, buffRarities: ['common'] },
    sprite: 'slime',
    description: '忘れられた墓所の瘴気を吸い、青白く肥大した粘体。',
    tier: 1,
    boss: false,
    elite: false,
  },
  {
    id: 'grave-shaman',
    skills: [{ skillId: 'skill_attack', weight: SKILL.attackWeight, actionTimeMs: 6500 }],
    name: '墓守の呪術師',
    englishName: 'Grave Shaman',
    maxHp: 105,
    attack: 14,
    defense: 1,
    specialGaugeMax: 100,
    specialAbilities: [{
      id: 'healing-prayer',
      name: '穢れた祈り',
      description: '最もHP割合が低い敵を最大HPの30%回復する。',
      gaugeCost: 100,
      effects: [{ effectType: 'heal', targetType: 'singleEnemy', value: 30, valueType: 'max-hp-percent' }],
      soundId: 'enemy_special_heal',
    }],
    aiRules: [
      { abilityId: 'healing-prayer', priority: 10, condition: { type: 'ally-hp-below', percent: 80 } },
      { abilityId: 'healing-prayer', priority: 1, condition: { type: 'always' } },
    ],
    rewards: { gold: [24, 38], experience: 18, buffRarities: ['common', 'uncommon'] },
    sprite: 'shaman',
    description: '死者の囁きを操り、傷ついた魔物を癒やす後衛の術師。',
    tier: 1,
    boss: false,
    elite: false,
  },
  {
    id: 'goblin-archer',
    skills: [{ skillId: 'skill_attack', weight: SKILL.attackWeight, actionTimeMs: 4200 }],
    name: '洞窟の射手',
    englishName: 'Cave Archer',
    maxHp: 92,
    attack: 18,
    defense: 2,
    specialGaugeMax: 100,
    specialAbilities: [{
      id: 'execution-shot',
      name: '処刑の矢',
      description: '最もHP割合が低い冒険者を狙い撃つ。',
      gaugeCost: 100,
      effects: [{ effectType: 'damage', targetType: 'singleParty', value: 34, valueType: 'flat' }],
      soundId: 'enemy_special_damage',
    }],
    aiRules: [{ abilityId: 'execution-shot', priority: 1, condition: { type: 'always' } }],
    rewards: { gold: [20, 34], experience: 15, buffRarities: ['common'] },
    sprite: 'archer',
    description: '闇に紛れ、弱った獲物を執拗に狙う射手。',
    tier: 1,
    boss: false,
    elite: false,
  },
] as const satisfies readonly EnemyDefinition[];

// Fixed Tier 1 variants. No floor-dependent multipliers are applied.
export const DUNGEON_ENEMIES: readonly EnemyDefinition[] = [
  { ...ENEMY_DEFINITIONS[0], id: 'enemy_guardian', name: 'ガーディアン', englishName: 'Guardian', sprite: 'guardian',
    maxHp: 180, attack: 16, defense: 4,
    description: '墓道を塞ぐ、古びた盾を抱えた魔物。',
    skills: [{ skillId: 'skill_attack', weight: SKILL.guardian.attackWeight, actionTimeMs: SKILL.guardian.attackTimeMs }, { skillId: 'skill_cover', weight: SKILL.guardian.coverWeight, actionTimeMs: SKILL.guardian.coverTimeMs }] },
  { ...ENEMY_DEFINITIONS[1], id: 'enemy_shaman', name: 'シャーマン', englishName: 'Shaman',
    skills: [{ skillId: 'skill_attack', weight: SKILL.shaman.attackWeight, actionTimeMs: SKILL.shaman.attackTimeMs }, { skillId: 'skill_heal', weight: SKILL.shaman.healWeight, actionTimeMs: SKILL.shaman.healTimeMs }] },
  { ...ENEMY_DEFINITIONS[0], id: 'elite-slime', name: '重装の墓所スライム', englishName: 'Armored Crypt Slime',
    maxHp: 225, attack: 24, defense: 6, elite: true,
    skills: [{ skillId: 'skill_attack', weight: SKILL.attackWeight, actionTimeMs: 4800 }],
    description: '厚い外殻を持つエリート。通常の粘体より強力。' },
  { ...ENEMY_DEFINITIONS[1], id: 'crypt-warden', name: '墓所の守護者', englishName: 'Warden of the Crypt',
    maxHp: 550, attack: 28, defense: 7, boss: true,
    skills: [{ skillId: 'skill_attack', weight: SKILL.attackWeight, actionTimeMs: 5500 }],
    description: '第1区画の出口を封じる守護者。傷つくと自身を癒やす。',
    specialAbilities: [
      { id: 'warden-ruin', name: '滅びの波動', description: '全員に闇属性ダメージ。', gaugeCost: 100,
        effects: [{ effectType: 'damage', targetType: 'allParty', value: 24, valueType: 'flat' }], soundId: 'enemy_special_damage' },
      { id: 'warden-mend', name: '暗黒再生', description: '自身のHPを20%回復。', gaugeCost: 100,
        effects: [{ effectType: 'heal', targetType: 'self', value: 20, valueType: 'max-hp-percent' }], soundId: 'enemy_special_heal' },
    ],
    aiRules: [
      { abilityId: 'warden-mend', priority: 10, condition: { type: 'self-hp-below', percent: 30 } },
      { abilityId: 'warden-ruin', priority: 1, condition: { type: 'always' } },
    ],
  },
];

// Fixed Elite variants keep every randomly selected Elite slot stronger.
// These multipliers author definitions once; they never depend on dungeon floor.
export const ELITE_SKILL_ENEMIES: readonly EnemyDefinition[] = DUNGEON_ENEMIES
  .filter(enemy => enemy.id === 'enemy_guardian' || enemy.id === 'enemy_shaman')
  .map(enemy => ({ ...enemy, id: `${enemy.id}_elite`, name: `精鋭${enemy.name}`,
    englishName: `Elite ${enemy.englishName}`, elite: true,
    maxHp: Math.round(enemy.maxHp * 1.5), attack: Math.round(enemy.attack * 1.25), defense: enemy.defense + 3 }));

export const ENEMIES_BY_ID: Record<string, EnemyDefinition> = indexById([...ENEMY_DEFINITIONS, ...DUNGEON_ENEMIES, ...ELITE_SKILL_ENEMIES]);
