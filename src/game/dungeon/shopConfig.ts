import type { RecoveryProduct } from '../../types/rooms';

export const SHOP_CONFIG = {
  itemCount: 4, recoveryCount: 2, rerollCost: 40, rerollUiCooldownMs: 350,
  buffPrices: { common: 100, uncommon: 140, rare: 200, epic: 280, legendary: 400 },
  buffWeights: { common: 44, uncommon: 35, rare: 17, epic: 3, legendary: 1 },
} as const;
export const RECOVERY_PRODUCTS: readonly RecoveryProduct[] = [
  { id: 'small-potion', name: 'Small Potion', price: 60, ratio: .3, target: 'single' },
  { id: 'large-potion', name: 'Large Potion', price: 100, ratio: .6, target: 'single' },
  { id: 'party-potion', name: 'Party Potion', price: 120, ratio: .2, target: 'party' },
];
