export interface TypingSentence {
  readonly id: string;
  readonly text: string;
  readonly reading: string;
  readonly difficulty: number;
  readonly category?: string;
}

export interface TypingSentenceDeck {
  readonly remainingSentenceIds: readonly string[];
  readonly lastSentenceId: string | null;
  readonly rngState: number;
}

export interface RomajiSegment {
  readonly kana: string;
  readonly alternatives: readonly string[];
}

export type TypingInputResult = 'ignored' | 'correct' | 'miss' | 'completed';

export interface TypingEngineState {
  readonly sentenceId: string;
  readonly sentenceText: string;
  readonly reading: string;
  readonly segments: readonly RomajiSegment[];
  readonly segmentIndex: number;
  readonly segmentInput: string;
  readonly acceptedInput: string;
  readonly correctCharacterCount: number;
  readonly missCount: number;
  readonly currentCombo: number;
  readonly maxCombo: number;
  readonly completedSentences: number;
  readonly lastInput: 'idle' | 'correct' | 'miss';
  readonly completed: boolean;
  readonly acceptsOptionalN: boolean;
}

export interface TypingInputTransition {
  readonly state: TypingEngineState;
  readonly result: TypingInputResult;
}

export interface TypingDisplay {
  readonly typed: string;
  readonly current: string;
  readonly remaining: string;
  readonly candidates: readonly string[];
}
