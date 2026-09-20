import type { TypingSentence } from '../types/typing';
import { ADDITIONAL_SENTENCES } from './typingSentences/additional';
import { indexById } from '../utils/indexById';

export const TYPING_SENTENCES = [
  { id: 'sentence_001', text: '勇者は剣を構えた', reading: 'ゆうしゃ は けん を かまえた', difficulty: 1, category: 'fantasy' },
  { id: 'sentence_002', text: '今日も冒険に出かけよう', reading: 'きょう も ぼうけん に でかけよう', difficulty: 1, category: 'adventure' },
  { id: 'sentence_003', text: '小さな松明が闇を照らす', reading: 'ちいさな たいまつ が やみ を てらす', difficulty: 1, category: 'dungeon' },
  { id: 'sentence_004', text: '静かな足音が近づいてくる', reading: 'しずかな あしおと が ちかづいてくる', difficulty: 2, category: 'dungeon' },
  { id: 'sentence_005', text: '魔法の力を信じて進もう', reading: 'まほう の ちから を しんじて すすもう', difficulty: 2, category: 'magic' },
  { id: 'sentence_006', text: 'きっと仲間が守ってくれる', reading: 'きっと なかま が まもってくれる', difficulty: 2, category: 'party' },
  { id: 'sentence_007', text: '深淵から邪悪な声が響く', reading: 'しんえん から じゃあくな こえ が ひびく', difficulty: 3, category: 'dark-fantasy' },
  { id: 'sentence_008', text: '古びた石像の秘密を探る', reading: 'ふるびた せきぞう の ひみつ を さぐる', difficulty: 2, category: 'ruins' },
  { id: 'sentence_009', text: '素早く弱点を見つけ出せ', reading: 'すばやく じゃくてん を みつけだせ', difficulty: 3, category: 'battle' },
  { id: 'sentence_010', text: '勝利への道は指先で開く', reading: 'しょうり へ の みち は ゆびさき で ひらく', difficulty: 3, category: 'battle' },
  { id: 'sentence_011', text: '新聞に迷宮の記事が載った', reading: 'しんぶん に めいきゅう の きじ が のった', difficulty: 3, category: 'town' },
  { id: 'sentence_012', text: '烈火の魔術で敵を焼き払う', reading: 'れっか の まじゅつ で てき を やきはらう', difficulty: 3, category: 'magic' },
  ...ADDITIONAL_SENTENCES,
] as const satisfies readonly TypingSentence[];

export const TYPING_SENTENCES_BY_ID: Readonly<Record<string, TypingSentence>> = indexById(TYPING_SENTENCES);
