export type RecoveryProduct = {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly ratio: number;
} & (
  | { readonly effect: 'heal'; readonly target: 'single' | 'party' }
  | { readonly effect: 'revive'; readonly target: 'single' }
);
export type ShopItem = { readonly id: string; readonly price: number; readonly purchased: boolean } & (
  | { readonly type: 'recovery'; readonly recoveryId: string }
  | { readonly type: 'buff'; readonly buffId: string }
);
export interface ShopState { readonly items: readonly ShopItem[]; readonly rerollCount: number; readonly freeRerollsUsed?: number }
export type TreasureOutcome = 'buff' | 'gold' | 'party_heal' | 'rare_buff' | 'trap_battle';
export interface TreasureState {
  readonly opened: boolean;
  readonly outcome: TreasureOutcome | null;
  readonly resolved: boolean;
}
