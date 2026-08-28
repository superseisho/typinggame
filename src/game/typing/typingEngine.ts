import type {
  RomajiSegment,
  TypingDisplay,
  TypingEngineState,
  TypingInputTransition,
  TypingSentence,
} from '../../types/typing';
import { ROMAJI_MAP } from './romajiMap';

const SMALL_KANA = new Set(['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ']);

function toHiragana(value: string): string {
  return [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
  }).join('');
}

function tokenizeReading(reading: string): string[] {
  const characters = [...toHiragana(reading)];
  const tokens: string[] = [];
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    if (/\s/.test(current)) continue;
    const next = characters[index + 1];
    const combined = next && SMALL_KANA.has(next) ? `${current}${next}` : current;
    if (next && SMALL_KANA.has(next) && ROMAJI_MAP[combined]) {
      tokens.push(combined);
      index += 1;
    } else {
      tokens.push(current);
    }
  }
  return tokens;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function alternativesFor(token: string): readonly string[] {
  const alternatives = ROMAJI_MAP[token];
  if (!alternatives) throw new Error(`ローマ字変換に未対応の文字です: ${token}`);
  return alternatives;
}

export function compileRomajiSegments(reading: string): readonly RomajiSegment[] {
  const tokens = tokenizeReading(reading);
  const segments: RomajiSegment[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];

    if (token === 'っ') {
      if (!nextToken) {
        segments.push({ kana: token, alternatives: ['xtu', 'ltu'] });
        continue;
      }
      const nextAlternatives = alternativesFor(nextToken);
      const doubled = nextAlternatives.flatMap((alternative) => {
        const first = alternative[0];
        if (alternative.startsWith('ch')) return [`t${alternative}`];
        return first && /^[bcdfghjklmpqrstvwxyz]$/.test(first) && first !== 'n'
          ? [`${first}${alternative}`]
          : [];
      });
      segments.push({
        kana: `${token}${nextToken}`,
        alternatives: unique([...doubled, ...nextAlternatives.map((value) => `xtu${value}`), ...nextAlternatives.map((value) => `ltu${value}`)]),
      });
      index += 1;
      continue;
    }

    if (token === 'ん') {
      const isSentenceFinal = index === tokens.length - 1;
      segments.push({ kana: token, alternatives: isSentenceFinal ? ['nn'] : ['n', 'nn'] });
      continue;
    }

    segments.push({ kana: token, alternatives: alternativesFor(token) });
  }

  return segments;
}

export function createTypingEngineState(sentence: TypingSentence): TypingEngineState {
  return {
    sentenceId: sentence.id,
    sentenceText: sentence.text,
    reading: sentence.reading,
    segments: compileRomajiSegments(sentence.reading),
    segmentIndex: 0,
    segmentInput: '',
    acceptedInput: '',
    correctCharacterCount: 0,
    missCount: 0,
    currentCombo: 0,
    maxCombo: 0,
    completedSentences: 0,
    lastInput: 'idle',
    completed: false,
    acceptsOptionalN: false,
  };
}

export function moveToSentence(state: TypingEngineState, sentence: TypingSentence): TypingEngineState {
  return {
    ...createTypingEngineState(sentence),
    correctCharacterCount: state.correctCharacterCount,
    missCount: state.missCount,
    currentCombo: state.currentCombo,
    maxCombo: state.maxCombo,
    completedSentences: state.completedSentences,
    acceptsOptionalN: state.acceptsOptionalN,
  };
}

export function isTypingKey(key: string): boolean {
  return key.length === 1 && /^[a-z '-]$/i.test(key);
}

export function inputTypingKey(state: TypingEngineState, rawKey: string): TypingInputTransition {
  if (state.completed || !isTypingKey(rawKey)) return { state, result: 'ignored' };
  const key = rawKey.toLowerCase();
  let workingState = state;
  if (state.acceptsOptionalN) {
    const currentSegment = state.segments[state.segmentIndex];
    const canBelongToNextKana = key === 'n' && currentSegment?.alternatives.some(
      (alternative) => alternative.startsWith(`${state.segmentInput}${key}`),
    );
    if (key === 'n' && !canBelongToNextKana) {
      const nextCombo = state.currentCombo + 1;
      return {
        result: 'correct',
        state: {
          ...state,
          acceptsOptionalN: false,
          acceptedInput: `${state.acceptedInput}n`,
          correctCharacterCount: state.correctCharacterCount + 1,
          currentCombo: nextCombo,
          maxCombo: Math.max(state.maxCombo, nextCombo),
          lastInput: 'correct',
        },
      };
    }
    workingState = { ...state, acceptsOptionalN: key === 'n' && Boolean(canBelongToNextKana) };
  }

  const segment = workingState.segments[workingState.segmentIndex];
  if (!segment) return { state: { ...workingState, completed: true }, result: 'completed' };

  const nextInput = `${workingState.segmentInput}${key}`;
  const candidates = segment.alternatives.filter((alternative) => alternative.startsWith(nextInput));
  if (candidates.length === 0) {
    return {
      result: 'miss',
      state: {
        ...workingState,
        acceptsOptionalN: false,
        missCount: workingState.missCount + 1,
        currentCombo: 0,
        lastInput: 'miss',
      },
    };
  }

  const nextCombo = workingState.currentCombo + 1;
  const baseState: TypingEngineState = {
    ...workingState,
    correctCharacterCount: workingState.correctCharacterCount + 1,
    currentCombo: nextCombo,
    maxCombo: Math.max(state.maxCombo, nextCombo),
    lastInput: 'correct',
  };
  const segmentCompleted = candidates.some((alternative) => alternative === nextInput);
  if (!segmentCompleted) {
    return { state: { ...baseState, segmentInput: nextInput }, result: 'correct' };
  }

  const isLastSegment = workingState.segmentIndex === workingState.segments.length - 1;
  const completedWithSingleN = segment.kana === 'ん' && nextInput === 'n';
  return {
    result: isLastSegment ? 'completed' : 'correct',
    state: {
      ...baseState,
      segmentIndex: isLastSegment ? workingState.segmentIndex : workingState.segmentIndex + 1,
      segmentInput: '',
      acceptedInput: `${workingState.acceptedInput}${nextInput}`,
      completedSentences: workingState.completedSentences + (isLastSegment ? 1 : 0),
      completed: isLastSegment,
      acceptsOptionalN: completedWithSingleN,
    },
  };
}

export function getTypingDisplay(state: TypingEngineState): TypingDisplay {
  if (state.completed) {
    return { typed: state.acceptedInput, current: '', remaining: '', candidates: [] };
  }
  const segment = state.segments[state.segmentIndex];
  const candidates = segment.alternatives.filter((alternative) => alternative.startsWith(state.segmentInput));
  const selected = candidates[0] ?? segment.alternatives[0];
  const current = selected[state.segmentInput.length] ?? '';
  const segmentRemainder = selected.slice(state.segmentInput.length + 1);
  const later = state.segments.slice(state.segmentIndex + 1).map((item) => item.alternatives[0]).join('');
  return {
    typed: `${state.acceptedInput}${state.segmentInput}`,
    current,
    remaining: `${segmentRemainder}${later}`,
    candidates,
  };
}
