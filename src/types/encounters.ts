import type { BuffRarity } from './buffs';
import type { CharacterId } from './game';

export type RarityWeights = Readonly<Record<BuffRarity, number>>;
export type EventRequirement =
  | { readonly type: 'gold'; readonly amount: number }
  | { readonly type: 'hp'; readonly ratio: number; readonly targetId?: CharacterId };
export type EventEffect =
  | { readonly type: 'gold'; readonly min: number; readonly max: number }
  | { readonly type: 'heal' | 'damage'; readonly ratio: number; readonly targetId?: CharacterId; readonly nonlethal?: boolean }
  | { readonly type: 'buff'; readonly weights: RarityWeights }
  | { readonly type: 'random'; readonly outcomes: readonly { readonly weight: number; readonly effects: readonly EventEffect[] }[] }
  | { readonly type: 'none' };
export interface EventChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly requirements?: readonly EventRequirement[];
  readonly effects: readonly EventEffect[];
}
export interface EventDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly choices: readonly EventChoice[];
}
export interface EncounterState {
  readonly definitionId: string;
  readonly selectedChoiceId: string | null;
  readonly costPaid: boolean;
  readonly resolved: boolean;
  readonly pendingGold: number;
}
