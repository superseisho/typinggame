export type CharacterId = 'warrior' | 'mage' | 'cleric' | 'martial-artist';
export type CharacterRole = 'tank' | 'magic-dps' | 'healer' | 'combo-dps';
export type Element = 'physical' | 'fire' | 'ice' | 'lightning' | 'holy' | 'dark';
export type CombatStatus = 'ready' | 'active' | 'victory' | 'defeat';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type EnemyTargetRule = 'frontmost' | 'lowest-hp' | 'round-robin';
export type AbilityVisualKind = 'guard' | 'cast' | 'heal' | 'combo';
export type AbilityPersistence = 'persistent' | 'instant';
export type CharacterVisualState =
  | 'normal'
  | 'low_hp'
  | 'damaged'
  | 'low_hp_damaged'
  | 'down'
  | 'guard_active'
  | 'low_hp_guard_active'
  | 'cast_active'
  | 'low_hp_cast_active'
  | 'heal_active'
  | 'low_hp_heal_active'
  | 'combo_active'
  | 'low_hp_combo_active';
import type { SoundId } from './audio';
import type { BuffCombatResources, RunBuff } from './buffs';

export interface CharacterArtSet {
  readonly normal: string;
  readonly lowHp: string;
  readonly damaged: string;
  readonly lowHpDamaged: string;
  readonly down: string;
  readonly abilityActive: string;
  readonly lowHpAbilityActive: string;
}

export interface BaseStats {
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
}

export type AbilityTrigger =
  | { readonly type: 'completed-prompts'; readonly threshold: number }
  | { readonly type: 'correct-characters'; readonly threshold: number }
  | { readonly type: 'combo-milestones'; readonly thresholds: readonly number[] };

export type AbilityEffect =
  | { readonly type: 'guard-next-hit' }
  | { readonly type: 'multiply-next-attack'; readonly multiplier: number }
  | { readonly type: 'damage-all-enemies'; readonly power: number }
  | { readonly type: 'heal-lowest-ally'; readonly power: number }
  | { readonly type: 'combo-attack-scaling'; readonly multipliers: readonly number[] };

export interface AbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: AbilityTrigger;
  readonly effects: readonly AbilityEffect[];
  readonly visual: {
    readonly kind: AbilityVisualKind;
    readonly persistence: AbilityPersistence;
    readonly displayMs?: number;
  };
  readonly soundId?: SoundId;
}

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly name: string;
  readonly englishName: string;
  readonly role: CharacterRole;
  readonly roleLabel: string;
  readonly portraitGlyph: string;
  readonly accentColor: string;
  readonly art: CharacterArtSet;
  readonly stats: BaseStats;
  readonly attackThreshold: number;
  readonly attackElement: Element;
  readonly targetRule: EnemyTargetRule;
  readonly audio: {
    readonly attack: SoundId;
    readonly ability?: SoundId;
  };
  readonly ability: AbilityDefinition;
}

export type EnemyAbilityTarget = 'singleParty' | 'allParty' | 'self' | 'singleEnemy' | 'allEnemies';
export type EnemyAbilityEffect =
  | { readonly effectType: 'empower-next-attack'; readonly targetType: EnemyAbilityTarget; readonly multiplier: number }
  | { readonly effectType: 'typing-curse'; readonly bonus: number }
  | {
      readonly effectType: 'damage';
      readonly targetType: EnemyAbilityTarget;
      readonly value: number;
      readonly valueType: 'flat' | 'max-hp-percent';
    }
  | {
      readonly effectType: 'heal';
      readonly targetType: EnemyAbilityTarget;
      readonly value: number;
      readonly valueType: 'flat' | 'max-hp-percent';
    }
  | {
      readonly effectType: 'buff' | 'debuff';
      readonly targetType: EnemyAbilityTarget;
      readonly stat: 'attack' | 'defense' | 'actionTime' | 'attackThreshold';
      readonly value: number;
      readonly durationMs?: number;
    };

export interface EnemySpecialAbility {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly gaugeCost: number;
  readonly effects: readonly EnemyAbilityEffect[];
  readonly soundId?: SoundId;
}

export type EnemyAiCondition =
  | { readonly type: 'always' }
  | { readonly type: 'self-hp-below'; readonly percent: number }
  | { readonly type: 'ally-hp-below'; readonly percent: number };

export interface EnemyAiRule {
  readonly abilityId: string;
  readonly priority: number;
  readonly condition: EnemyAiCondition;
}

export interface EnemyRewards {
  readonly gold: readonly [number, number];
  readonly experience: number;
  readonly buffRarities: readonly Rarity[];
}

export interface EnemyDefinition {
  readonly skills: readonly { readonly skillId: string; readonly weight: number; readonly actionTimeMs: number }[];
  readonly id: string;
  readonly name: string;
  readonly englishName: string;
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
  readonly specialGaugeMax: number;
  readonly specialAbilities: readonly EnemySpecialAbility[];
  readonly aiRules: readonly EnemyAiRule[];
  readonly rewards: EnemyRewards;
  readonly sprite: string;
  readonly description: string;
  readonly tier: number;
  readonly boss: boolean;
  readonly elite: boolean;
}

export interface CharacterCombatState {
  readonly definitionId: CharacterId;
  readonly currentHp: number;
  readonly attackCharge: number;
  readonly abilityCharge: number;
  readonly statuses: readonly string[];
}

export interface EnemyCombatState {
  readonly nextAttackEmpowerMultiplier: number;
  readonly nextActionSkillId: string | null;
  readonly actionDurationMs: number;
  readonly cover: { readonly remainingHits: number } | null;
  readonly instanceId: string;
  readonly definitionId: string;
  readonly formationIndex: number;
  readonly currentHp: number;
  readonly actionRemainingMs: number;
  readonly specialGauge: number;
  readonly attackMultiplier: number;
  readonly defenseMultiplier: number;
  readonly actionTimeMultiplier: number;
  readonly statuses: readonly string[];
  readonly pendingSpecial: {
    readonly abilityId: string;
    readonly remainingMs: number;
  } | null;
}

export interface CombatStats {
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly timeoutCount: number;
}

export type CombatEventKind =
  | 'enemy-skill-used'
  | 'enemy-cover'
  | 'system'
  | 'typing-correct'
  | 'typing-miss'
  | 'ally-attack'
  | 'ally-damaged'
  | 'ally-heal'
  | 'ally-buff'
  | 'ally-debuff'
  | 'ally-ability-triggered'
  | 'ally-ability-ended'
  | 'ally-ability-damage'
  | 'ally-guard-consumed'
  | 'enemy-special-ready'
  | 'enemy-special-used'
  | 'enemy-heal'
  | 'enemy-buff'
  | 'enemy-debuff'
  | 'ally-defeated'
  | 'enemy-defeated'
  | 'victory'
  | 'defeat';

export interface CombatEvent {
  readonly skillId?: string;
  readonly originalTargetId?: string;
  readonly actualDamage?: number;
  readonly id: number;
  readonly kind: CombatEventKind;
  readonly message: string;
  readonly actorId?: string;
  readonly targetId?: string;
  readonly amount?: number;
  /** HP immediately after this effect, before a subsequent heal or hit. */
  readonly targetHpAfter?: number;
  readonly abilityId?: string;
  readonly effectType?: EnemyAbilityEffect['effectType'];
  readonly soundId?: SoundId;
}

export interface CombatState {
  readonly buffRngState: number;
  readonly lastMissProtected: boolean;
  readonly sentenceDeck: import('./typing').TypingSentenceDeck;
  readonly typingCurseBonus: number;
  readonly typingCurseRemainingMs: number;
  readonly skillRngState: number;
  readonly targetEnemyId: string | null;
  readonly runBuffs: readonly RunBuff[];
  readonly buffResources: BuffCombatResources;
  readonly status: CombatStatus;
  readonly party: readonly CharacterCombatState[];
  readonly enemies: readonly EnemyCombatState[];
  readonly typing: import('./typing').TypingEngineState;
  readonly stats: CombatStats;
  readonly partyTargetCursor: number;
  readonly eventSequence: number;
  readonly events: readonly CombatEvent[];
  readonly log: readonly CombatEvent[];
}
