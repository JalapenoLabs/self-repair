// Copyright © 2026 self-repair contributors

import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import importPlugin from 'eslint-plugin-import-x'
// @ts-ignore
import licenseHeader from 'eslint-plugin-license-header'

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '.yarn/**',
  ]),

  // Base configuration for TS and JS files
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
    },

    files: [ '**/*.{ts,js,cjs}' ],

    plugins: {
      '@stylistic': stylistic,
      'import-x': importPlugin,
      'license-header': licenseHeader,
      '@typescript-eslint': tseslint.plugin,
    },

    settings: {
      'import-x/resolver': {
        typescript: true,
        node: true,
      },
    },

    rules: {
      // ─── Google 2015 Typescript Guide (adapted) ─────────────────────────

      'no-cond-assign': 'off',
      'no-irregular-whitespace': 'error',
      'no-unexpected-multiline': 'error',
      'curly': [ 'error', 'all' ],
      'no-caller': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-invalid-this': 'error',
      'no-multi-spaces': 'error',
      'no-multi-str': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-with': 'error',
      'prefer-promise-reject-errors': 'error',
      'array-bracket-newline': 'off',
      'array-element-newline': 'off',
      'block-spacing': [ 'error', 'never' ],
      'camelcase': [ 'error', { properties: 'never' }],
      'comma-dangle': [ 'error', 'always-multiline' ],
      'comma-spacing': 'error',
      'comma-style': 'error',
      'computed-property-spacing': 'error',
      'func-call-spacing': 'error',
      'indent': 'off',
      'key-spacing': 'error',
      'keyword-spacing': [ 'error', { before: true, after: true }],
      'linebreak-style': 'off',
      'new-cap': 'error',
      'no-array-constructor': 'error',
      'no-mixed-spaces-and-tabs': 'error',
      'no-multiple-empty-lines': [ 'error', { max: 2 }],
      'no-new-object': 'error',
      'no-tabs': 'error',
      'no-trailing-spaces': 'error',
      'one-var': [ 'error', { var: 'never', let: 'never', const: 'never' }],
      'padded-blocks': [ 'error', 'never' ],
      'quote-props': [ 'error', 'consistent' ],
      'quotes': [ 'error', 'single', { allowTemplateLiterals: true }],
      'semi': [ 'error', 'never' ],
      'semi-spacing': 'error',
      'space-before-blocks': 'error',
      'space-before-function-paren': [ 'error', {
        asyncArrow: 'always',
        anonymous: 'never',
        named: 'never',
      }],
      'spaced-comment': [ 'error', 'always' ],
      'switch-colon-spacing': 'error',
      'arrow-parens': [ 'error', 'always' ],
      'constructor-super': 'error',
      'generator-star-spacing': [ 'error', 'after' ],
      'no-new-symbol': 'error',
      'no-this-before-super': 'error',
      'no-var': 'error',
      'prefer-const': [ 'error', { destructuring: 'all' }],
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'rest-spread-spacing': 'error',
      'yield-star-spacing': [ 'error', 'after' ],

      // ─── Project preferences ────────────────────────────────────────────

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/ban-types': 'off',
      'consistent-return': 'error',
      'import-x/no-extraneous-dependencies': 'off',
      'guard-for-in': 'off',
      'no-useless-return': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [ 'error' ],
      'no-useless-escape': 'error',
      'yoda': 'error',
      'operator-linebreak': [ 'error', 'before' ],

      'brace-style': [ 'error', 'stroustrup', { allowSingleLine: false }],
      '@stylistic/eol-last': [ 'error', 'always' ],

      'array-bracket-spacing': [ 'error', 'always', {
        objectsInArrays: false,
        arraysInArrays: false,
      }],

      'object-curly-spacing': [ 'error', 'always', {
        objectsInObjects: false,
        arraysInObjects: false,
      }],

      'import-x/no-default-export': 'error',
      'no-restricted-exports': [ 'error', {
        restrictedNamedExports: [ 'default' ],
      }],

      'require-jsdoc': 'off',

      'max-len': [ 'error', {
        code: 120,
        tabWidth: 2,
        ignoreUrls: true,
      }],

      'license-header/header': [
        'error',
        [
          '// Copyright © 2026 self-repair contributors',
        ],
      ],
    },
  },

  // Test files override
  {
    files: [ '**/__test__/**/*.{js,ts}', '**/*.{test,spec}.{js,ts}' ],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
      'max-len': 'off',
      'consistent-return': 'off',
    },
  },

  // Config files override
  {
    files: [ '**/*.config.{cjs,js,ts}', '**/*.config.*.{cjs,js,ts}' ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import-x/no-default-export': 'off',
      'no-undef': 'off',
      'no-restricted-exports': 'off',
    },
  },

  // Declaration files override
  {
    files: [ '**/*.d.ts' ],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
      'spaced-comment': 'off',
    },
  },
])
