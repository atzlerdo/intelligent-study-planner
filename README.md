# React + TypeScript + Vite

# Intelligent Study Planner

A full-stack study planning application for managing university courses with Google Calendar integration.

## Quick Start

### 1. Setup Environment Variables

**Frontend:**
```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local and add your Google OAuth credentials
# Get them from: https://console.cloud.google.com/
```

**Backend:**
```bash
cd server
# Copy the example file
cp .env.example .env.local

# Edit .env.local and set a strong JWT secret
# Generate one with: openssl rand -base64 32
```

### 2. Install Dependencies

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
cd server
npm install
```

### 3. Run Development Servers

**Frontend (port 5173):**
```bash
npm run dev
```

**Backend (port 3001):**
```bash
cd server
npm run dev
```

## Environment Variables

### Frontend (.env.local)
- `VITE_GOOGLE_CLIENT_ID` - Your Google OAuth 2.0 Client ID
- `VITE_GOOGLE_API_KEY` - Your Google API Key

### Backend (server/.env.local)
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - Secret key for JWT signing (MUST be changed from default)
- `DATABASE_PATH` - Path to SQLite database file
- `NODE_ENV` - Environment mode (development/production)

⚠️ **IMPORTANT:** Never commit `.env.local` files! They contain your actual credentials.

## Documentation

- See `.github/copilot-instructions.md` for AI coding agent instructions
- See `CHANGELOG.md` for version history
- See `SECURITY.md` for security policy
- See `docs/` for additional documentation

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
