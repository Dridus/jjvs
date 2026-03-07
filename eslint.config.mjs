// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', 'webview-ui/dist/**', '*.mjs'],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules applied to all .ts files (no type-checking pass; fast)
  {
    files: ['**/*.ts'],
    extends: tseslint.configs.recommended,
  },

  // Project-wide rules for TypeScript source
  {
    files: ['**/*.ts'],
    rules: {
      // TypeScript correctness
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // General style
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Core layer: mechanically enforce zero VSCode imports.
  // This is a hard architectural boundary — do not weaken or bypass.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vscode'],
              message:
                'src/core/ must not import from vscode. The core layer must be pure TypeScript with no VSCode dependencies so it can be unit-tested with vitest.',
            },
          ],
        },
      ],
    },
  },

  // Test files: relax some rules that are too strict for test code
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'off',
    },
  },
);
