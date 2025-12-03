# Environment Setup Guide

## Overview

This project uses a **two-tier environment variable system** to separate public defaults from private credentials:

1. **`.env`** - Default/placeholder values (committed to git, safe to publish)
2. **`.env.local`** - Your actual credentials (gitignored, never committed)

## Setup Instructions

### First Time Setup

1. **Frontend Configuration:**
   ```bash
   # .env.local already exists with your credentials
   # Or create it from .env if needed:
   cp .env .env.local
   
   # Edit .env.local and add your actual Google OAuth credentials
   nano .env.local  # or use your preferred editor
   ```

2. **Backend Configuration:**
   ```bash
   cd server
   
   # .env.local already exists with your credentials
   # Or create it from .env if needed:
   cp .env .env.local
   
   # Edit .env.local and set a strong JWT secret
   nano .env.local
   ```

### File Structure

```
intelligent-study-planner/
├── .env              # ✅ Committed - Placeholder values
├── .env.example      # ✅ Committed - Template for new developers
├── .env.local        # 🔒 Gitignored - YOUR ACTUAL CREDENTIALS
└── server/
    ├── .env          # ✅ Committed - Placeholder values
    ├── .env.example  # ✅ Committed - Template
    └── .env.local    # 🔒 Gitignored - YOUR ACTUAL CREDENTIALS
```

## How It Works

### Vite (Frontend)
Vite automatically loads environment variables in this order:
1. `.env` - Base values
2. **`.env.local`** - Overrides .env (your actual credentials)
3. `.env.[mode]` - Mode-specific (.env.development, .env.production)
4. `.env.[mode].local` - Mode-specific overrides

**Result:** Your `.env.local` values override the placeholders in `.env`

### Node.js (Backend)
The backend uses `dotenv` which loads:
1. `.env` - Base values
2. **`.env.local`** - Overrides .env (your actual credentials)

## Current Configuration

### ✅ Safe Files (Committed to Git)
- `.env` - Contains placeholder: `VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com`
- `server/.env` - Contains placeholder: `JWT_SECRET=your-super-secret-jwt-key-change-this-in-production`
- `.env.example` - Template for new developers
- `server/.env.example` - Template for backend

### 🔒 Private Files (Gitignored)
- `.env.local` - Contains your actual Google OAuth Client ID
- `server/.env.local` - Contains your actual JWT secret

## Verification

Check that your setup is correct:

```bash
# Should show placeholder values
cat .env
cat server/.env

# Should show your actual credentials
cat .env.local
cat server/.env.local

# Verify gitignore is working
git status
# .env.local should NOT appear in untracked files
```

## For New Team Members

When someone clones the repository:

1. **They get:**
   - `.env` with placeholders
   - `.env.example` as reference
   - Instructions in README.md

2. **They need to:**
   ```bash
   # Frontend
   cp .env.example .env.local
   # Edit .env.local with their own credentials
   
   # Backend
   cd server
   cp .env.example .env.local
   # Edit .env.local with their own JWT secret
   ```

3. **They never commit:**
   - `.env.local` (automatically gitignored)
   - Their personal credentials

## Security Benefits

✅ **Safe to publish:** `.env` files only contain placeholders  
✅ **Safe to commit:** No real credentials in version control  
✅ **Works locally:** Your `.env.local` provides actual values  
✅ **Team friendly:** Each developer has their own `.env.local`  
✅ **CI/CD ready:** Production uses environment variables from hosting platform

## Troubleshooting

### "Environment variable not found"
- Make sure `.env.local` exists
- Check that it contains the required variables
- Restart the dev server after changing .env files

### "Invalid credentials"
- Verify your `.env.local` has correct values
- Check Google Cloud Console for correct OAuth credentials
- Ensure authorized redirect URIs include `http://localhost:5173`

### ".env.local appears in git status"
- Check `.gitignore` includes `.env.local`
- If already tracked: `git rm --cached .env.local`
- Verify with: `git check-ignore -v .env.local`

## Production Deployment

For production (e.g., Vercel, Netlify, AWS):
- **DO NOT** deploy `.env.local` files
- Set environment variables in hosting platform dashboard
- Use strong, randomly generated secrets
- Enable HTTPS and proper CORS configuration

Example production environment variables:
```bash
VITE_GOOGLE_CLIENT_ID=<your-production-client-id>
VITE_GOOGLE_API_KEY=<your-production-api-key>
JWT_SECRET=$(openssl rand -base64 32)  # Generate strong secret
DATABASE_PATH=/var/data/study-planner.db
NODE_ENV=production
```
