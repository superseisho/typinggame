import { describe, expect, it } from 'vitest';
import { TYPING_SENTENCES } from '../../data/typingSentences';
import { createSentenceDeck, drawSentence } from './sentenceDeck';

describe('sentence dataset', () => {
  it('contains exactly 200 unique numbered sentences with valid metadata', () => {
    expect(TYPING_SENTENCES).toHaveLength(200);
    expect(TYPING_SENTENCES.map(s => s.id)).toEqual(Array.from({ length: 200 }, (_, i) => `sentence_${String(i + 1).padStart(3, '0')}`));
    expect(new Set(TYPING_SENTENCES.map(s => s.text)).size).toBe(200);
    for (const sentence of TYPING_SENTENCES) {
      expect(sentence.reading.trim().length).toBeGreaterThan(0);
      expect(sentence.category.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(sentence.difficulty);
    }
    expect([1, 2, 3].map(d => TYPING_SENTENCES.filter(s => s.difficulty === d).length)).toEqual([60, 80, 60]);
  });
});

describe('seeded sentence shuffle bag', () => {
  it('draws every sentence once, reproducibly, without changing the source', () => {
    const initial = createSentenceDeck(42);
    let deck = initial;
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) {
      const draw = drawSentence(deck);
      ids.push(draw.sentenceId);
      deck = draw.deck;
    }
    expect(new Set(ids).size).toBe(200);
    expect(deck.remainingSentenceIds).toHaveLength(0);
    expect(initial.remainingSentenceIds).toHaveLength(200);
    expect(ids).toEqual(createSentenceDeck(42).remainingSentenceIds);
    expect(ids).not.toEqual(createSentenceDeck(43).remainingSentenceIds);
    expect(ids).not.toEqual(TYPING_SENTENCES.map(s => s.id));
    const secondCycle = drawSentence(deck);
    expect(secondCycle.deck.remainingSentenceIds).toHaveLength(199);
    expect(secondCycle.sentenceId).not.toBe(ids[199]);
  });
  it('refills small pools without consecutive repeats at cycle boundaries', () => {
    const pool = ['A', 'B', 'C'];
    let deck = createSentenceDeck(123, pool);
    for (let cycle = 0; cycle < 20; cycle++) {
      const previous = deck.lastSentenceId;
      const ids: string[] = [];
      for (let i = 0; i < pool.length; i++) {
        const draw = drawSentence(deck, pool);
        deck = draw.deck;
        ids.push(draw.sentenceId);
      }
      expect(new Set(ids).size).toBe(pool.length);
      expect(ids[0]).not.toBe(previous);
    }
  });
  it('handles single-entry pools and rejects empty or duplicate pools', () => {
    const first = drawSentence(createSentenceDeck(0, ['A']), ['A']);
    expect(drawSentence(first.deck, ['A']).sentenceId).toBe('A');
    expect(() => createSentenceDeck(0, [])).toThrow();
    expect(() => createSentenceDeck(0, ['A', 'A'])).toThrow();
  });
});
