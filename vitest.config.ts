import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/shared/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/shared/__tests__/setup.ts'],
  },
});
