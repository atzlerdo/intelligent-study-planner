# Setup Guide - Intelligent Study Planner

**For:** First-time setup on a fresh Windows computer  
**Time Required:** ~15-20 minutes  
**Last Updated:** December 3, 2024

---

## Prerequisites Checklist

Before starting, make sure you have:
- [ ] Windows 10/11
- [ ] Administrator access
- [ ] Internet connection
- [ ] GitHub account (for cloning the repository)

---

## Step 1: Install Node.js and npm

### Option A: Using winget (Recommended for Windows 11)

1. Open PowerShell as Administrator (Right-click Start → Windows PowerShell (Admin))

2. Install Node.js LTS:
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

3. Enable PowerShell script execution (required for npm):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

4. **⚠️ IMPORTANT:** Close ALL PowerShell windows and restart VS Code (or any terminal)
   - This is required for the PATH environment variable to update
   - Open a fresh PowerShell window

5. Verify installation:
   ```powershell
   node --version    # Should show v24.x.x or higher
   npm --version     # Should show 11.x.x or higher
   ```

   If `npm` is not recognized, run this in the new terminal:
   ```powershell
   $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
   ```

### Option B: Manual Installation

1. Download Node.js LTS from: https://nodejs.org/
2. Run the installer (accept all defaults)
3. Restart your computer
4. Open PowerShell and run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
5. Verify: `node --version` and `npm --version`

---

## Step 2: Install Git (if not already installed)

1. Check if Git is installed:
   ```powershell
   git --version
   ```

2. If not installed, use winget:
   ```powershell
   winget install Git.Git
   ```

3. Or download from: https://git-scm.com/download/win

4. Restart PowerShell and verify: `git --version`

---

## Step 3: Clone the Repository

1. Navigate to where you want the project:
   ```powershell
   cd C:\Users\YourUsername\Documents  # Or your preferred location
   ```

2. Clone the repository:
   ```powershell
   git clone https://github.com/atzlerdo/intelligent-study-planner.git
   cd intelligent-study-planner
   ```

---

## Step 4: Set Up Google OAuth Credentials

### Create Google Cloud Project

1. Go to: https://console.cloud.google.com/
2. Click "Create Project" or select an existing project
3. Name it: "Intelligent Study Planner"

### Enable Google Calendar API

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External
   - App name: Intelligent Study Planner
   - User support email: Your email
   - Developer contact: Your email
   - Add scope: `../auth/calendar` (Google Calendar API)
   - Add test users: Your email address
   - Save and continue

4. Create OAuth client ID:
   - Application type: **Web application**
   - Name: Study Planner Web Client
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173`
   - Click "Create"

5. **Copy your credentials:**
   - Client ID (looks like: `123456789-abc123.apps.googleusercontent.com`)
   - You can find these anytime in "APIs & Services" → "Credentials"

### Create API Key (Optional but recommended)

1. In Credentials page, click "Create Credentials" → "API Key"
2. Copy the API key
3. Click "Restrict Key" (optional):
   - API restrictions: Select "Google Calendar API"
   - Save

---

## Step 5: Configure Environment Variables

### Frontend Configuration

1. Navigate to project root (if not already there)

2. Create `.env.local` file:
   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Edit `.env.local` with your favorite editor:
   ```powershell
   notepad .env.local
   # Or use VS Code: code .env.local
   ```

4. Replace the placeholder values with your actual credentials from Step 4:
   ```env
   VITE_GOOGLE_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID_HERE.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=YOUR_ACTUAL_API_KEY_HERE
   ```

5. Save and close the file

### Backend Configuration

1. Navigate to server directory:
   ```powershell
   cd server
   ```

2. Create `.env.local` file:
   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Edit `server\.env.local`:
   ```powershell
   notepad .env.local
   ```

4. Generate a strong JWT secret:
   ```powershell
   # Option 1: Use PowerShell to generate random string
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
   
   # Option 2: Use a password generator website
   # Option 3: Just make up a long random string
   ```

5. Update `.env.local`:
   ```env
   PORT=3001
   JWT_SECRET=YOUR_STRONG_RANDOM_SECRET_HERE
   DATABASE_PATH=./data/study-planner.db
   NODE_ENV=development
   ```

6. Save and close

7. Return to project root:
   ```powershell
   cd ..
   ```

---

## Step 6: Install Dependencies

### Frontend Dependencies

1. From project root, run:
   ```powershell
   npm install
   ```

   This will take 2-5 minutes. You'll see a progress bar.

### Backend Dependencies

1. Navigate to server:
   ```powershell
   cd server
   npm install
   ```

2. Return to project root:
   ```powershell
   cd ..
   ```

---

## Step 7: Start the Application

You need to run both frontend and backend simultaneously.

### Option A: Quick Start Script (Easiest) ⭐

1. Open PowerShell in the project root folder

2. Run the start script:
   ```powershell
   .\start-dev.ps1
   ```

3. The script will:
   - ✓ Check Node.js installation
   - ✓ Install dependencies if needed
   - ✓ Check environment files
   - ✓ Start both servers automatically

4. Wait for both servers to start, then open: http://localhost:5173

5. Press `Ctrl+C` to stop both servers

### Option B: Two PowerShell Windows (Manual Control)

**Window 1 - Backend:**
```powershell
cd server
npm run dev
```
- Wait for "Server running on http://localhost:3001"
- Keep this window open

**Window 2 - Frontend:**
```powershell
npm run dev
```
- Wait for "Local: http://localhost:5173/"
- Keep this window open

### Option C: VS Code Integrated Terminal (Recommended for Development)

1. Open project in VS Code:
   ```powershell
   code .
   ```

2. Open two terminal tabs (Terminal → New Terminal)

3. In Terminal 1 (Backend):
   ```bash
   cd server
   npm run dev
   ```

4. In Terminal 2 (Frontend):
   ```bash
   npm run dev
   ```

---

## Step 8: Test the Application

1. Open your browser and go to: http://localhost:5173

2. You should see the login/registration screen

3. Create a new account:
   - Enter email and password
   - Click "Register"

4. Test basic functionality:
   - [ ] Login works
   - [ ] Create a course
   - [ ] Create a study session
   - [ ] Connect to Google Calendar (optional)

---

## Troubleshooting

### "npm is not recognized"
**Solution:**
1. Close and reopen PowerShell
2. If still not working, restart your computer
3. Verify installation: `npm --version`

### "Cannot be loaded because running scripts is disabled"
**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Module not found" or import errors
**Solution:**
1. Delete node_modules and reinstall:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   
   cd server
   Remove-Item -Recurse -Force node_modules
   npm install
   cd ..
   ```

### "EADDRINUSE: Port already in use"
**Solution:**
1. Another process is using port 5173 or 3001
2. Close other dev servers
3. Or change port in `vite.config.ts` or `server/.env.local`

### Google Calendar connection fails
**Solution:**
1. Verify redirect URIs in Google Cloud Console include `http://localhost:5173`
2. Check `.env.local` has correct Client ID
3. Make sure you added your email as a test user in OAuth consent screen
4. Clear browser cache and try again

### Database errors
**Solution:**
1. Delete the database and let it recreate:
   ```powershell
   Remove-Item server\data\study-planner.db
   ```
2. Restart backend server

### "Failed to fetch" or network errors
**Solution:**
1. Make sure backend is running on port 3001
2. Check backend terminal for errors
3. Verify `server/.env.local` exists and has JWT_SECRET

---

## Development Workflow

### Daily Development

1. Open two terminals
2. Start backend: `cd server && npm run dev`
3. Start frontend: `npm run dev`
4. Open http://localhost:5173
5. Make changes (auto-reloads on save)

### Stopping the Servers

Press `Ctrl+C` in each terminal window to stop the servers.

### Updating Dependencies

```powershell
# Update frontend
npm update

# Update backend
cd server
npm update
```

---

## Project Structure

```
intelligent-study-planner/
├── .env.local              # Your actual credentials (gitignored)
├── .env.example            # Template for credentials
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── lib/               # Utilities and API client
│   └── types/             # TypeScript types
├── server/                # Backend
│   ├── .env.local         # Backend credentials (gitignored)
│   ├── src/               # Backend source code
│   └── data/              # SQLite database (gitignored)
├── docs/                  # Documentation
├── SETUP_GUIDE.md        # This file
└── README.md             # Project overview
```

---

## Security Reminders

⚠️ **NEVER commit these files:**
- `.env.local` (frontend credentials)
- `server/.env.local` (backend credentials)
- `server/data/*.db` (database with user data)

✅ **Safe to commit:**
- `.env` (placeholder values only)
- `.env.example` (template)
- All source code

---

## Next Steps

After successful setup:

1. Read `README.md` for project overview
2. Check `.github/copilot-instructions.md` for development guidelines
3. Review `CHANGELOG.md` for recent changes
4. Explore `docs/` folder for detailed documentation

---

## Getting Help

- **Issues:** https://github.com/atzlerdo/intelligent-study-planner/issues
- **Documentation:** See `docs/` folder
- **Security:** See `SECURITY.md`

---

## Quick Reference Commands

```powershell
# Check installations
node --version
npm --version
git --version

# Install dependencies
npm install              # Frontend
cd server; npm install   # Backend

# Run development servers
npm run dev              # Frontend (port 5173)
cd server; npm run dev   # Backend (port 3001)

# Build for production
npm run build            # Frontend
cd server; npm run build # Backend

# Lint code
npm run lint
```

---

**Setup Complete!** 🎉

You're now ready to develop and use the Intelligent Study Planner.
