export const ENEMY_SKILL_CONFIG = {
  attackWeight: 70,
  guardian: { attackWeight: 70, coverWeight: 30, cooldownMs: 10000, maxHits: 3 },
  shaman: { attackWeight: 65, healWeight: 35, cooldownMs: 8000, healRatio: .25 },
  feedbackMs: 720,
} as const;

export interface EnemySkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly effect: 'attack' | 'cover' | 'heal';
  readonly requirement: 'always' | 'other-alive' | 'injured-alive';
  readonly targetType: 'party' | 'other-enemies' | 'lowest-enemy-hp';
  readonly cooldownMs: number;
}
export const ENEMY_SKILLS: Readonly<Record<string, EnemySkillDefinition>> = {
  skill_attack: { id: 'skill_attack', name: 'Attack', effect: 'attack', requirement: 'always', targetType: 'party', cooldownMs: 0 },
  skill_cover: { id: 'skill_cover', name: 'Cover', effect: 'cover', requirement: 'other-alive', targetType: 'other-enemies', cooldownMs: ENEMY_SKILL_CONFIG.guardian.cooldownMs },
  skill_heal: { id: 'skill_heal', name: 'Heal', effect: 'heal', requirement: 'injured-alive', targetType: 'lowest-enemy-hp', cooldownMs: ENEMY_SKILL_CONFIG.shaman.cooldownMs },
};
