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
    mocha: true,
  },
  rules: {
    '@typescript-eslint/ban-ts-comment': ['off'],
    'no-var': ['error'],
    'prefer-const': ['error'],
  },
};
