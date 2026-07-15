import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
// Use the named `configs` export rather than `<default>.configs`. The default
// is typed as the loose `ESLint.Plugin` interface, where `configs` is optional
// and unioned with the legacy `.eslintrc` shape, which tsc rejects. The named
// export gives a strictly typed `flat/recommended: Linter.FlatConfig`.
import { configs as litConfigs } from 'eslint-plugin-lit'
import { configs as wcConfigs } from 'eslint-plugin-wc'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/api/defaults'
import prettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  // tmp/, static/, dist/ hold generated output and aren't linted.
  // node_modules and dotfiles are ignored by default in flat config.
  {
    ignores: ['tmp/**', 'static/**', 'dist/**'],
  },

  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    extends: [js.configs.recommended, litConfigs['flat/recommended'], wcConfigs['flat/recommended']],
    languageOptions: { globals: globals.browser },
  },

  // TypeScript: recommended rules + type-aware overrides
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

  // Tailwind CSS: correctness rules only (no-unknown-classes, no-conflicting-classes).
  // Stylistic rules (class sorting etc.) are intentionally omitted: sorting is
  // already handled by prettier-plugin-tailwindcss. Classes in twJoin/twMerge
  // calls (tailwind-merge) are detected out of the box.
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    extends: [betterTailwindcss.configs.correctness],
    settings: {
      'better-tailwindcss': {
        // Tailwind v4: resolve valid classes (incl. custom @theme colors) from
        // the CSS entry point. Relative to the eslint cwd (web/).
        entryPoint: 'tailwind.css',
        // The plugin can't see class="..." inside lit html`` templates, so class
        // strings must flow through a detected source: twJoin/twMerge calls
        // (covered by the defaults) or variables matched here. A custom
        // `selectors` list REPLACES the defaults, hence the spread. The extra
        // selector lints string values (incl. object values, e.g. a
        // `purposeClasses` map) of any variable ending in ...Class/...Classes.
        selectors: [
          ...getDefaultSelectors(),
          // The plugin requires the regex to match the WHOLE name (not just
          // a substring), hence the leading .*
          {
            kind: 'variable',
            name: '.*[cC]lass(es)?$',
            match: [{ type: 'strings' }, { type: 'objectValues' }],
          },
        ],
      },
    },
  },

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

  // Disable formatting rules that conflict with Prettier (must be last)
  prettier,
])
