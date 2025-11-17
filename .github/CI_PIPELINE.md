# CI/CD Pipeline Documentation

## Overview
Comprehensive GitHub Actions CI/CD pipeline for the Intelligent Study Planner full-stack application.

## Workflow Triggers
- **Push to `main` branch** - Runs on every commit to main
- **Push to `feature/*` branches** - Tests feature branches before merging
- **Pull Requests to `main`** - Validates PRs automatically

## Pipeline Architecture

### Three Parallel Jobs

#### 1. Frontend Build & Lint
Tests the React + TypeScript frontend application.

**Steps:**
1. Checkout repository
2. Setup Node.js 20 with npm caching
3. Install frontend dependencies (`npm ci`)
4. Run ESLint code quality checks
5. Build production bundle with dummy Google credentials
6. Type-check with TypeScript compiler

**Environment Variables:**
- `VITE_GOOGLE_CLIENT_ID` - Uses GitHub secret or fallback dummy value
- `VITE_GOOGLE_API_KEY` - Uses GitHub secret or fallback dummy value

#### 2. Backend Build & Lint
Tests the Node.js + Express backend application.

**Steps:**
1. Checkout repository
2. Setup Node.js 20 with npm caching (server/package-lock.json)
3. Install backend dependencies in `./server` directory
4. Run ESLint (if configured)
5. Build TypeScript backend
6. Type-check with TypeScript compiler

#### 3. Integration Check
Validates that frontend and backend work together.

**Steps:**
1. Waits for frontend and backend jobs to complete (`needs: [frontend, backend]`)
2. Checkout repository
3. Setup Node.js 20
4. Install dependencies for both frontend and backend
5. Build both applications
6. Start backend server in background (port 3001)
7. Wait 5 seconds for server startup
8. Perform health check with curl
9. Upload build artifacts (retained for 7 days)

**Environment Variables:**
- `JWT_SECRET: test-secret-key-for-ci` - Test JWT secret
- `PORT: 3001` - Backend port
- `DATABASE_PATH: ./data/test-study-planner.db` - Test database

## Build Artifacts
- **Retention:** 7 days
- **Contents:**
  - `dist/` - Frontend production build
  - `server/dist/` - Backend compiled JavaScript

## Setting Up GitHub Secrets

To enable proper Google Calendar integration testing, add these secrets to your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:
   - `VITE_GOOGLE_CLIENT_ID` - Your Google OAuth 2.0 Client ID
   - `VITE_GOOGLE_API_KEY` - Your Google API Key

**Note:** The pipeline will use dummy values if secrets are not configured, allowing builds to complete.

## Failure Notifications

You will receive email notifications when:
- Any job fails (frontend, backend, or integration)
- Type checking finds errors
- Linting finds code quality issues
- Build compilation fails
- Health check fails (warning only)

## Local Testing

To test the same checks locally before pushing:

```bash
# Frontend
npm ci
npm run lint
npm run build
npx tsc --noEmit

# Backend
cd server
npm ci
npm run build
npx tsc --noEmit

# Integration test (in separate terminals)
cd server && npm start    # Terminal 1
npm run dev               # Terminal 2
```

## Troubleshooting

### "npm ci" fails
- Ensure `package-lock.json` is committed
- Delete `node_modules` locally and run `npm install`
- Commit the updated lock file

### TypeScript errors
- Run `npx tsc --noEmit` locally to see errors
- Fix type issues before pushing

### Health check fails
- Check that backend starts without errors
- Ensure `/health` endpoint exists (or remove health check step)
- Verify `DATABASE_PATH` directory exists

### Lint failures
- Run `npm run lint` locally
- Fix ESLint errors or update ESLint config if needed

## Performance

**Estimated run time:**
- Frontend job: ~2-3 minutes
- Backend job: ~1-2 minutes
- Integration job: ~3-4 minutes

**Total pipeline:** ~4-5 minutes (jobs run in parallel)

## Future Enhancements

Potential improvements:
- Add unit tests (Jest/Vitest for frontend, Jest for backend)
- Add integration tests with database fixtures
- Add E2E tests with Playwright/Cypress
- Add code coverage reporting
- Add deployment step for successful builds
- Add database migration tests
- Add performance benchmarking

## Maintenance

**When to update:**
- Node.js version changes → Update `node-version: '20'`
- New dependencies added → Pipeline auto-installs via `npm ci`
- New build steps required → Add to relevant job
- Repository structure changes → Update `working-directory` paths

---

**Last Updated:** November 17, 2025
**Pipeline Version:** 1.0
**Status:** ✅ Active
