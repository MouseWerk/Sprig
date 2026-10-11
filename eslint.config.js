// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Jest setup and tests run under Jest's globals
    files: ['jest.setup.js', '__tests__/**'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
  {
    // Release scripts run in Node, not in the app
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', process: 'readonly' } },
  },
]);
