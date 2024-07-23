import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['lib/**'],
      reporter: ['text'],
    },
    globals: false,
    include: ['test/*-test.js'],
    testTimeout: 1000,
  },
});
