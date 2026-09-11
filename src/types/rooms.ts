export interface RecoveryProduct {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly ratio: number;
  readonly target: 'single' | 'party';
}
export type ShopItem = { readonly id: string; readonly price: number; readonly purchased: boolean } & (
  | { readonly type: 'recovery'; readonly recoveryId: string }
  | { readonly type: 'buff'; readonly buffId: string }
);
export interface ShopState { readonly items: readonly ShopItem[]; readonly rerollCount: number }
export type TreasureOutcome = 'buff' | 'gold' | 'party_heal' | 'rare_buff' | 'trap_battle';
export interface TreasureState {
  readonly opened: boolean;
  readonly outcome: TreasureOutcome | null;
  readonly resolved: boolean;
}
