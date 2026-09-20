import { TYPING_SENTENCES } from '../../data/typingSentences';
import type { TypingSentenceDeck } from '../../types/typing';
import { randomStep } from '../../utils/random';

const SENTENCE_IDS = TYPING_SENTENCES.map(sentence => sentence.id);

function refill(deck: TypingSentenceDeck, pool: readonly string[]): TypingSentenceDeck {
  if (pool.length === 0 || new Set(pool).size !== pool.length) throw Error('Sentence pool must be nonempty and unique');
  const ids = [...pool];
  let rngState = deck.rngState;
  for (let i = ids.length - 1; i > 0; i--) {
    const random = randomStep(rngState);
    rngState = random.seed;
    const j = Math.floor(random.value * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (ids.length > 1 && ids[0] === deck.lastSentenceId) [ids[0], ids[1]] = [ids[1], ids[0]];
  return { ...deck, remainingSentenceIds: ids, rngState };
}

export function createSentenceDeck(seed: number, pool: readonly string[] = SENTENCE_IDS): TypingSentenceDeck {
  return refill({ remainingSentenceIds: [], lastSentenceId: null, rngState: seed >>> 0 }, pool);
}

/** Called only when a new sentence is about to be displayed; never from React rendering. */
export function drawSentence(deck: TypingSentenceDeck, pool: readonly string[] = SENTENCE_IDS) {
  const ready = deck.remainingSentenceIds.length ? deck : refill(deck, pool);
  const sentenceId = ready.remainingSentenceIds[0];
  return { sentenceId, deck: { ...ready, lastSentenceId: sentenceId, remainingSentenceIds: ready.remainingSentenceIds.slice(1) } };
}
