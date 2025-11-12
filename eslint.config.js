import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignore built artifacts everywhere (root dist and nested dist folders like server/dist)
  globalIgnores(['dist', '**/dist/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Keep project defaults; overrides below fine-tune noisy or generated areas
    },
  },
  // Overrides
  {
    files: ['server/**/*.{ts,tsx}'],
    rules: {
      // Server typing uses some 'any' for database rows/params; relax this rule for now
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: [
      'src/components/ui/**/*.{ts,tsx}',
      'src/components/RecurrencePatternPicker.tsx',
    ],
    rules: {
      // shadcn/ui files and certain component helpers export non-component utilities; disable this noisy rule
      'react-refresh/only-export-components': 'off',
    },
  },
])
