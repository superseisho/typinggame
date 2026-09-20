import { TYPING_SENTENCES_BY_ID } from '../../data/typingSentences';
import { drawSentence } from '../typing/sentenceDeck';
import type { CombatState } from '../../types/game';
import { inputTypingKey, moveToSentence } from '../typing/typingEngine';
import { applyCorrectTyping, applyTypingMiss } from './combatEngine';

export function handleCombatTyping(state: CombatState, key: string, now = Date.now()): CombatState {
  if (state.status !== 'active') return state;
  const transition = inputTypingKey(state.typing, key);
  if (transition.result === 'ignored') return state;
  if (transition.result === 'miss') return applyTypingMiss(state, transition.state, now);

  const next = applyCorrectTyping(state, transition.state, now);
  if (transition.result !== 'completed' || next.status !== 'active') return next;
  const drawn = drawSentence(next.sentenceDeck);
  return { ...next, sentenceDeck: drawn.deck,
    typing: moveToSentence(next.typing, TYPING_SENTENCES_BY_ID[drawn.sentenceId]) };
}
