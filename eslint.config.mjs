import js from '@eslint/js';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  { ignores: ['node_modules/', 'lib/', '.github/'] },

  {
    ...js.configs.recommended,
    files: ['src/**/*.js', 'index.js'],
    plugins: { sonarjs },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        SillyTavern: 'readonly',
        $:           'readonly',
        jQuery:      'readonly',
        iro:         'readonly',
        mermaid:     'readonly',
        localforage: 'readonly',
        Fuse:        'readonly',
        Diff:        'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef':       'error',
      'no-console':     'off',
      'prefer-const':   'warn',
      'no-var':         'error',
      ...sonarjs.configs.recommended.rules,
      // False positives for this codebase — not security-critical contexts
      'sonarjs/pseudo-random': 'off',   // Math.random() used for color generation only
      'sonarjs/slow-regex':    'off',   // regexes are not user-facing attack surfaces
      // Downgrade to warnings so CI doesn't fail while we work through them
      'sonarjs/cognitive-complexity':    'warn',
      'sonarjs/no-nested-conditional':   'warn',
      'sonarjs/no-nested-template-literals': 'warn',
    },
  },
];
