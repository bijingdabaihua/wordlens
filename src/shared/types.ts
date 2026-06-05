// Shared type definitions

export interface WordRecord {
  id: string;
  word: string;
  translation: string;
  sentence: string;
  url: string;
  timestamp: number;
  frequency: number;
  forgottenCount: number;
  rememberedCount: number;
  status: 'learning' | 'known' | 'mastered';
  lastReviewed: number;
}

export interface TranslationResult {
  word: string;
  translation: string;
  sourceSentence: string;
  partOfSpeech?: string;
  phonetic?: string;
}
