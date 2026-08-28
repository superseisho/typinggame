import { describe, expect, it } from 'vitest';
import type { TypingSentence } from '../../types/typing';
import { TYPING_SENTENCES } from '../../data/typingSentences';
import { compileRomajiSegments, createTypingEngineState, inputTypingKey } from './typingEngine';

function sentence(reading: string): TypingSentence {
  return { id: 'test', text: reading, reading, difficulty: 1 };
}

function typeReading(reading: string, input: string) {
  let state = createTypingEngineState(sentence(reading));
  for (const key of input) state = inputTypingKey(state, key).state;
  return state;
}

describe('Japanese romaji typing engine', () => {
  it.each([
    ['し', 'shi'], ['し', 'si'],
    ['ち', 'chi'], ['ち', 'ti'],
    ['つ', 'tsu'], ['つ', 'tu'],
    ['ふ', 'fu'], ['ふ', 'hu'],
    ['じ', 'ji'], ['じ', 'zi'],
    ['しゃ', 'sha'], ['しゃ', 'sya'],
    ['ちゃ', 'cha'], ['ちゃ', 'tya'],
    ['じゃ', 'ja'], ['じゃ', 'jya'], ['じゃ', 'zya'],
  ])('accepts %s as %s', (reading, input) => {
    expect(typeReading(reading, input).completed).toBe(true);
  });

  it('keeps shi and si candidates alive after typing s', () => {
    const initial = createTypingEngineState(sentence('し'));
    const afterS = inputTypingKey(initial, 's').state;
    expect(afterS.segmentInput).toBe('s');
    expect(afterS.completed).toBe(false);
    expect(inputTypingKey(afterS, 'h').result).toBe('correct');
    expect(typeReading('し', 'si').completed).toBe(true);
  });

  it('handles sokuon by doubling the following consonant', () => {
    expect(typeReading('きって', 'kitte').completed).toBe(true);
    expect(typeReading('まっちゃ', 'matcha').completed).toBe(true);
  });

  it('accepts either n or nn for ん before consonants and vowels', () => {
    expect(typeReading('しんぶを', 'shinbuwo').completed).toBe(true);
    expect(typeReading('しんぶを', 'shinnbuwo').completed).toBe(true);
    expect(typeReading('しんあいを', 'shinaiwo').completed).toBe(true);
    expect(typeReading('しんあいを', 'shinnaiwo').completed).toBe(true);
    expect(compileRomajiSegments('んあ')[0].alternatives).toEqual(['n', 'nn']);
  });

  it('accepts both n routes when the following kana also starts with n', () => {
    expect(typeReading('かんな', 'kanna').completed).toBe(true);
    expect(typeReading('かんな', 'kannna').completed).toBe(true);
  });

  it('accepts nn for every ん in 深淵から', () => {
    expect(typeReading('しんえんから', 'sinenkara').acceptedInput).toBe('sinenkara');
    const doubleN = typeReading('しんえんから', 'sinnennkara');
    expect(doubleN.completed).toBe(true);
    expect(doubleN.acceptedInput).toBe('sinnennkara');
    expect(doubleN.missCount).toBe(0);
  });

  it('requires nn for a sentence-final ん before completing the sentence', () => {
    const reading = 'おそいかかるまおうのじゃがん';
    const beforeFinalN = typeReading(reading, 'osoikakarumaounojagan');
    expect(beforeFinalN.completed).toBe(false);
    expect(beforeFinalN.segmentInput).toBe('n');

    const completed = typeReading(reading, 'osoikakarumaounojagann');
    expect(completed.completed).toBe(true);
    expect(completed.acceptedInput).toBe('osoikakarumaounojagann');
    expect(completed.missCount).toBe(0);
  });

  it('does not advance the candidate state on a miss', () => {
    const initial = createTypingEngineState(sentence('し'));
    const afterS = inputTypingKey(initial, 's').state;
    const missed = inputTypingKey(afterS, 'x').state;
    expect(missed.segmentInput).toBe('s');
    expect(missed.missCount).toBe(1);
    expect(missed.currentCombo).toBe(0);
  });

  it('uses reading spaces only as visual separators and never requires typing them', () => {
    expect(typeReading('きょう も ぼうけん', 'kyoumoboukenn').completed).toBe(true);
    expect(compileRomajiSegments('きょう も').every((segment) => segment.kana !== ' ')).toBe(true);
  });

  it.each(TYPING_SENTENCES)('can compile and complete $id', (typingSentence) => {
    const canonicalInput = compileRomajiSegments(typingSentence.reading)
      .map((segment) => segment.alternatives[0])
      .join('');
    let state = createTypingEngineState(typingSentence);
    for (const key of canonicalInput) state = inputTypingKey(state, key).state;
    expect(state.completed).toBe(true);
  });
});
