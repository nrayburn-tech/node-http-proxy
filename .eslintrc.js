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
  },
  rules: {
    '@typescript-eslint/ban-ts-comment': ['off'],
    '@typescript-eslint/no-empty-function': ['off'],
    'no-var': ['error'],
    'prefer-const': ['error'],
  },
};
