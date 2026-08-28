import { TYPING_SENTENCES } from '../../data/typingSentences';
import type { CombatState } from '../../types/game';
import { inputTypingKey, moveToSentence } from '../typing/typingEngine';
import { applyCorrectTyping, applyTypingMiss } from './combatEngine';

function nextSentenceId(currentId: string): number {
  const currentIndex = TYPING_SENTENCES.findIndex((sentence) => sentence.id === currentId);
  return (currentIndex + 1) % TYPING_SENTENCES.length;
}

export function handleCombatTyping(state: CombatState, key: string, now = Date.now()): CombatState {
  if (state.status !== 'active') return state;
  const transition = inputTypingKey(state.typing, key);
  if (transition.result === 'ignored') return state;
  if (transition.result === 'miss') return applyTypingMiss(state, transition.state, now);

  const typing = transition.result === 'completed'
    ? moveToSentence(transition.state, TYPING_SENTENCES[nextSentenceId(transition.state.sentenceId)])
    : transition.state;
  return applyCorrectTyping(state, typing, now);
}
