import { describe, it, expect, beforeEach } from 'vitest';
import {
  addWord,
  getAllWords,
  getWord,
  updateReviewResult,
  deleteWord,
  clearAll,
  getStats,
  estimateVocabulary,
  getCEFRLevel,
  getWordsByPriority,
} from '../storage';
import { storageMock } from './setup';

describe('storage operations', () => {
  beforeEach(async () => {
    // Clear storage mock between tests
    Object.keys(storageMock).forEach((k) => delete storageMock[k]);
  });

  describe('addWord', () => {
    it('should add a new word record', async () => {
      const record = await addWord('hello', '你好', 'Hello world!', 'https://example.com');

      expect(record.word).toBe('hello');
      expect(record.translation).toBe('你好');
      expect(record.sentence).toBe('Hello world!');
      expect(record.url).toBe('https://example.com');
      expect(record.frequency).toBe(1);
      expect(record.status).toBe('learning');
      expect(record.id).toBeTruthy();
    });

    it('should increment frequency for existing word (case-insensitive)', async () => {
      await addWord('Hello', '你好', '', '');
      const record2 = await addWord('hello', '你好', 'New sentence', '');

      expect(record2.frequency).toBe(2);
      expect(record2.sentence).toBe('New sentence'); // updated
    });

    it('should not create duplicate records for same word', async () => {
      await addWord('test', '测试', '', '');
      await addWord('TEST', '测试', '', '');
      const all = await getAllWords();

      expect(all).toHaveLength(1);
      expect(all[0].frequency).toBe(2);
    });
  });

  describe('getAllWords / getWord', () => {
    it('should return empty array when no words saved', async () => {
      const words = await getAllWords();
      expect(words).toEqual([]);
    });

    it('should retrieve all added words', async () => {
      await addWord('apple', '苹果', '', '');
      await addWord('book', '书', '', '');
      await addWord('cat', '猫', '', '');

      const all = await getAllWords();
      expect(all).toHaveLength(3);
    });

    it('should get a specific word by text', async () => {
      await addWord('hello', '你好', '', '');
      const found = await getWord('hello');
      expect(found).toBeTruthy();
      expect(found!.translation).toBe('你好');
    });

    it('should return undefined for non-existent word', async () => {
      const found = await getWord('nonexistent');
      expect(found).toBeUndefined();
    });

    it('should find word case-insensitively', async () => {
      await addWord('Hello', '你好', '', '');
      const found = await getWord('HELLO');
      expect(found).toBeTruthy();
    });
  });

  describe('updateReviewResult', () => {
    it('should increment rememberedCount and update status when remembered', async () => {
      const record = await addWord('test', '测试', '', '');
      await updateReviewResult(record.id, true);

      const updated = await getWord('test');
      expect(updated!.rememberedCount).toBe(1);
      expect(updated!.status).toBe('learning'); // still learning after 1 remember
    });

    it('should promote status to known after 3 remembers', async () => {
      const record = await addWord('test', '测试', '', '');
      for (let i = 0; i < 3; i++) {
        await updateReviewResult(record.id, true);
      }

      const updated = await getWord('test');
      expect(updated!.status).toBe('known');
    });

    it('should promote status to mastered after 7 remembers', async () => {
      const record = await addWord('test', '测试', '', '');
      for (let i = 0; i < 7; i++) {
        await updateReviewResult(record.id, true);
      }

      const updated = await getWord('test');
      expect(updated!.status).toBe('mastered');
    });

    it('should increment forgottenCount and set status to learning when forgotten', async () => {
      // First make it known
      const record = await addWord('test', '测试', '', '');
      for (let i = 0; i < 3; i++) {
        await updateReviewResult(record.id, true);
      }

      // Now forget it
      await updateReviewResult(record.id, false);
      const updated = await getWord('test');
      expect(updated!.forgottenCount).toBe(1);
      expect(updated!.status).toBe('learning');
    });

    it('should do nothing for non-existent ID', async () => {
      // Should not throw
      await expect(updateReviewResult('nonexistent', true)).resolves.toBeUndefined();
    });
  });

  describe('deleteWord / clearAll', () => {
    it('should delete a word by ID', async () => {
      const record = await addWord('test', '测试', '', '');
      expect((await getAllWords())).toHaveLength(1);

      await deleteWord(record.id);
      expect((await getAllWords())).toHaveLength(0);
    });

    it('should clear all words', async () => {
      await addWord('a', '', '', '');
      await addWord('b', '', '', '');
      await addWord('c', '', '', '');

      await clearAll();
      expect((await getAllWords())).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return zeros for empty store', async () => {
      const stats = await getStats();
      expect(stats.total).toBe(0);
      expect(stats.learning).toBe(0);
      expect(stats.known).toBe(0);
      expect(stats.mastered).toBe(0);
      expect(stats.totalFrequency).toBe(0);
      expect(stats.averageForgotten).toBe(0);
    });

    it('should correctly categorize words by status', async () => {
      await addWord('learning1', '', '', '');
      await addWord('learning2', '', '', '');

      // Make r3 "known" (3 remembers)
      const r3 = await addWord('known1', '', '', '');
      for (let i = 0; i < 3; i++) await updateReviewResult(r3.id, true);

      // Make r4 "mastered" (7 remembers)
      const r4 = await addWord('mastered1', '', '', '');
      for (let i = 0; i < 7; i++) await updateReviewResult(r4.id, true);

      const stats = await getStats();
      expect(stats.total).toBe(4);
      expect(stats.learning).toBe(2);
      expect(stats.known).toBe(1);
      expect(stats.mastered).toBe(1);
    });
  });

  describe('estimateVocabulary / getCEFRLevel', () => {
    it('should estimate vocabulary from mastered count', () => {
      expect(estimateVocabulary(0)).toBe(0);
      expect(estimateVocabulary(10)).toBe(40);
      expect(estimateVocabulary(100)).toBe(400);
      expect(estimateVocabulary(500)).toBe(2000);
    });

    it('should map to correct CEFR levels', () => {
      expect(getCEFRLevel(200)).toBe('A1');
      expect(getCEFRLevel(800)).toBe('A2');
      expect(getCEFRLevel(2000)).toBe('B1');
      expect(getCEFRLevel(4000)).toBe('B2');
      expect(getCEFRLevel(6000)).toBe('C1');
      expect(getCEFRLevel(10000)).toBe('C2');
    });
  });

  describe('calculatePriority / getWordsByPriority', () => {
    it('should return higher priority for forgotten words', async () => {
      const r1 = await addWord('forgotten', '被遗忘的', '', '');
      await updateReviewResult(r1.id, false);
      await updateReviewResult(r1.id, false);

      const r2 = await addWord('remembered', '记住的', '', '');
      await updateReviewResult(r2.id, true);

      const sorted = await getWordsByPriority();
      // forgotten should rank higher
      expect(sorted[0].word).toBe('forgotten');
    });

    it('should return empty array when no words', async () => {
      const sorted = await getWordsByPriority();
      expect(sorted).toEqual([]);
    });
  });
});
