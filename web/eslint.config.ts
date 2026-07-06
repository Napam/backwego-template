import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import json from '@eslint/json'
import markdown from '@eslint/markdown'
import css from '@eslint/css'
// Use the named `configs` export rather than `<default>.configs`. The default
// is typed as the loose `ESLint.Plugin` interface, where `configs` is optional
// and unioned with the legacy `.eslintrc` shape, which tsc rejects. The named
// export gives a strictly typed `flat/recommended: Linter.FlatConfig`.
import { configs as litConfigs } from 'eslint-plugin-lit'
import { configs as wcConfigs } from 'eslint-plugin-wc'
import prettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  // 1. Global ignores
  // tmp/, static/, dist/ hold generated output and aren't linted.
  // node_modules and dotfiles are ignored by default in flat config.
  // tailwind.css is a Tailwind v4 manifest: it uses @custom-variant / @theme
  // at-rules the @eslint/css (CSSTree) parser can't parse; it's not hand-written CSS.
  {
    ignores: ['tmp/**', 'static/**', 'dist/**', 'tailwind.css'],
  },

  // 2. Base JS & browser globals (applies to web-component source)
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    extends: [js.configs.recommended, litConfigs['flat/recommended'], wcConfigs['flat/recommended']],
    languageOptions: { globals: globals.browser },
  },

  // 3. TypeScript: recommended rules + type-aware overrides
  // defineConfig flattens arrays, so tseslint.configs.recommended drops in directly.
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts}'],
    rules: {
      // Allow @ts-expect-error only with a description; ban all others so that
      // suppressed type errors stay visible in code review.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
    },
  },

  // 4. Build scripts run under Bun
  // globals has no Bun key, so compose it from node globals + a manual Bun global.
  {
    files: ['build.ts', 'scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: 'readonly',
      },
    },
  },

  // 5. JSON Configurations
  {
    files: ['**/*.json'],
    plugins: { json },
    language: 'json/json',
    extends: ['json/recommended'],
  },
  {
    files: ['**/*.jsonc'],
    plugins: { json },
    language: 'json/jsonc',
    extends: ['json/recommended'],
  },
  {
    files: ['**/*.json5'],
    plugins: { json },
    language: 'json/json5',
    extends: ['json/recommended'],
  },

  // 6. Markdown
  {
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    extends: ['markdown/recommended'],
  },

  // 7. CSS
  {
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    extends: ['css/recommended'],
  },

  // 8. Disable formatting rules that conflict with Prettier (must be last)
  prettier,
])
