// Test setup — mock chrome.storage.local
import { vi } from 'vitest';

const storageMock: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | Record<string, unknown> | null) => {
        if (typeof keys === 'string') {
          return { [keys]: storageMock[keys] ?? null };
        }
        if (Array.isArray(keys)) {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            result[key] = storageMock[key] ?? null;
          }
          return result;
        }
        if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
          const result: Record<string, unknown> = {};
          for (const key of Object.keys(keys)) {
            result[key] = storageMock[key] ?? (keys as Record<string, unknown>)[key];
          }
          return result;
        }
        return { ...storageMock };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageMock, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          delete storageMock[key];
        }
      }),
      clear: vi.fn(async () => {
        Object.keys(storageMock).forEach((k) => delete storageMock[k]);
      }),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = chromeMock;

export { storageMock };
