import { describe, it, expect } from 'vitest';
import { lookupWord, hasWord, getDictionarySize } from '../dictionary';

describe('dictionary', () => {
  describe('lookupWord', () => {
    it('should return entry for existing word', () => {
      const entry = lookupWord('hello');
      expect(entry).toBeDefined();
      expect(entry!.translation).toContain('你好');
      expect(entry!.phonetic).toBeTruthy();
      expect(entry!.partOfSpeech).toBeTruthy();
    });

    it('should be case-insensitive', () => {
      const upper = lookupWord('HELLO');
      const lower = lookupWord('hello');
      const mixed = lookupWord('Hello');

      expect(upper).toEqual(lower);
      expect(mixed).toEqual(lower);
    });

    it('should trim whitespace', () => {
      const trimmed = lookupWord('  hello  ');
      const normal = lookupWord('hello');
      expect(trimmed).toEqual(normal);
    });

    it('should return undefined for non-existent word', () => {
      const entry = lookupWord('xyzzy_nonexistent_word');
      expect(entry).toBeUndefined();
    });

    it('should include A-Words', () => {
      const abandon = lookupWord('abandon');
      expect(abandon).toBeDefined();
      expect(abandon!.translation).toContain('放弃');
    });

    it('should include B-Words', () => {
      const balance = lookupWord('balance');
      expect(balance).toBeDefined();
      expect(balance!.translation).toContain('平衡');
    });

    it('should include C-Words', () => {
      const culture = lookupWord('culture');
      expect(culture).toBeDefined();
      expect(culture!.translation).toContain('文化');
    });
  });

  describe('hasWord', () => {
    it('should return true for existing words', () => {
      expect(hasWord('abandon')).toBe(true);
      expect(hasWord('focus')).toBe(true);
    });

    it('should return false for non-existing words', () => {
      expect(hasWord('supercalifragilistic')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(hasWord('ABANDON')).toBe(true);
      expect(hasWord('Abandon')).toBe(true);
    });
  });

  describe('getDictionarySize', () => {
    it('should return a positive number', () => {
      const size = getDictionarySize();
      expect(size).toBeGreaterThan(0);
    });

    it('should contain at least 2000 entries', () => {
      expect(getDictionarySize()).toBeGreaterThanOrEqual(2000);
    });
  });
});
