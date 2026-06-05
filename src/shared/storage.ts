// chrome.storage wrapper for word record operations

import type { WordRecord } from './types';

const STORAGE_KEY = 'wordlens_words';
const API_KEY_KEY = 'wordlens_api_key';

// ─── Helpers ───────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): number {
  return Date.now();
}

// ─── Word Operations ───────────────────────────────────────────────────

/**
 * Add a new word record, or update frequency if the word already exists.
 * Returns the updated/new record.
 */
export async function addWord(
  word: string,
  translation: string,
  sentence: string,
  url: string,
): Promise<WordRecord> {
  const words = await getAllWords();
  const key = word.toLowerCase().trim();
  const existing = words.find((w) => w.word.toLowerCase() === key);

  if (existing) {
    existing.frequency += 1;
    existing.timestamp = now();
    existing.sentence = sentence || existing.sentence;
    existing.translation = translation || existing.translation;
    await saveAll(words);
    return existing;
  }

  const record: WordRecord = {
    id: generateId(),
    word: word.trim(),
    translation,
    sentence,
    url,
    timestamp: now(),
    frequency: 1,
    forgottenCount: 0,
    rememberedCount: 0,
    status: 'learning',
    lastReviewed: now(),
  };

  words.push(record);
  await saveAll(words);
  return record;
}

/**
 * Get all word records.
 */
export async function getAllWords(): Promise<WordRecord[]> {
  try {
    const { [STORAGE_KEY]: data } = await chrome.storage.local.get(STORAGE_KEY);
    return (data as WordRecord[]) || [];
  } catch {
    // chrome.storage unavailable
    return [];
  }
}

/**
 * Get a single word record by its word text (case-insensitive).
 */
export async function getWord(word: string): Promise<WordRecord | undefined> {
  const words = await getAllWords();
  return words.find((w) => w.word.toLowerCase() === word.toLowerCase().trim());
}

/**
 * Update review result for a word.
 * @param id - Word record ID
 * @param remembered - true if user remembered, false if forgotten
 */
export async function updateReviewResult(id: string, remembered: boolean): Promise<void> {
  const words = await getAllWords();
  const record = words.find((w) => w.id === id);
  if (!record) return;

  record.lastReviewed = now();

  if (remembered) {
    record.rememberedCount += 1;
    if (record.rememberedCount >= 3) {
      record.status = 'known';
    }
    if (record.rememberedCount >= 7) {
      record.status = 'mastered';
    }
  } else {
    record.forgottenCount += 1;
    record.status = 'learning';
  }

  await saveAll(words);
}

/**
 * Delete a word record by ID.
 */
export async function deleteWord(id: string): Promise<void> {
  const words = await getAllWords();
  const filtered = words.filter((w) => w.id !== id);
  await saveAll(filtered);
}

/**
 * Delete all word records.
 */
export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// ─── Statistics ────────────────────────────────────────────────────────

export interface VocabularyStats {
  total: number;
  learning: number;
  known: number;
  mastered: number;
  totalFrequency: number;
  averageForgotten: number;
}

/**
 * Get vocabulary statistics.
 */
export async function getStats(): Promise<VocabularyStats> {
  const words = await getAllWords();

  const stats: VocabularyStats = {
    total: words.length,
    learning: words.filter((w) => w.status === 'learning').length,
    known: words.filter((w) => w.status === 'known').length,
    mastered: words.filter((w) => w.status === 'mastered').length,
    totalFrequency: words.reduce((sum, w) => sum + w.frequency, 0),
    averageForgotten: words.length
      ? words.reduce((sum, w) => sum + w.forgottenCount, 0) / words.length
      : 0,
  };

  return stats;
}

/**
 * Estimate vocabulary size based on mastered words.
 * Uses a multiplier to extrapolate from known words to estimated total.
 */
export function estimateVocabulary(masteredCount: number): number {
  // Each mastered word represents approximately 3-5 known words
  return masteredCount * 4;
}

/**
 * Map vocabulary size to CEFR level.
 */
export function getCEFRLevel(vocabularyEstimate: number): string {
  if (vocabularyEstimate < 500) return 'A1';
  if (vocabularyEstimate < 1500) return 'A2';
  if (vocabularyEstimate < 3000) return 'B1';
  if (vocabularyEstimate < 5000) return 'B2';
  if (vocabularyEstimate < 8000) return 'C1';
  return 'C2';
}

/**
 * Calculate review priority score for a word.
 * Higher score = should be reviewed sooner.
 */
export function calculatePriority(record: WordRecord): number {
  const nowMs = now();
  const hoursSinceReview = (nowMs - record.lastReviewed) / (1000 * 60 * 60);

  return (
    record.frequency * 0.3 +
    record.forgottenCount * 0.5 -
    record.rememberedCount * 0.2 +
    Math.min(hoursSinceReview / 24, 7) * 0.1
  );
}

/**
 * Get words sorted by review priority (descending).
 */
export async function getWordsByPriority(): Promise<WordRecord[]> {
  const words = await getAllWords();
  return words.sort((a, b) => calculatePriority(b) - calculatePriority(a));
}

// ─── Internal ──────────────────────────────────────────────────────────

async function saveAll(words: WordRecord[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: words });
}

// ─── API Key Operations ────────────────────────────────────────────────

/**
 * Save DeepSeek API key.
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_KEY]: apiKey });
}

/**
 * Get DeepSeek API key.
 */
export async function getApiKey(): Promise<string> {
  const { [API_KEY_KEY]: key } = await chrome.storage.local.get(API_KEY_KEY);
  return (key as string) || '';
}

/**
 * Check if API key is configured.
 */
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key.length > 0;
}
