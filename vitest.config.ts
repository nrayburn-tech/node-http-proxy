import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['**/test/*-test.js'],
    threads: false,
    testTimeout: 2500,
  },
});
