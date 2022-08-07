module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2016: true,
    // Not using jest, but the test globals are jest-like so this works.
    jest: true,
  },
  rules: {
    '@typescript-eslint/ban-ts-comment': ['off'],
    '@typescript-eslint/no-empty-function': ['off'],
    'no-var': ['error'],
    'prefer-const': ['error'],
  },
};
