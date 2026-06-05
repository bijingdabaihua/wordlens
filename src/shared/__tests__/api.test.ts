import { describe, it, expect } from 'vitest';
import { ApiError } from '../api';

describe('API client', () => {
  describe('ApiError', () => {
    it('should have correct name and properties', () => {
      const error = new ApiError('测试错误', 'NO_KEY');
      expect(error.name).toBe('ApiError');
      expect(error.message).toBe('测试错误');
      expect(error.code).toBe('NO_KEY');
    });

    it('should distinguish error types', () => {
      const noKey = new ApiError('no key', 'NO_KEY');
      const timeout = new ApiError('timeout', 'TIMEOUT');
      const rateLimit = new ApiError('rate limit', 'RATE_LIMIT');

      expect(noKey.code).toBe('NO_KEY');
      expect(timeout.code).toBe('TIMEOUT');
      expect(rateLimit.code).toBe('RATE_LIMIT');
    });

    it('should be instanceof Error', () => {
      const error = new ApiError('test', 'API_ERROR');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
