# Intelligent Study Planner

A full-stack study planning application for managing university courses with Google Calendar integration.

## Documentation

- [Setup Guide](docs/SETUP_GUIDE.md) — Installation and configuration
- [Security Policy](SECURITY.md) — Security practices and reporting
- [Tech Stack](docs/TECH_STACK.md) — Technologies and frameworks
- [Project Overview](docs/PROJECT_OVERVIEW.md) — Architecture and design
- [Changelog](CHANGELOG.md) — Version history and changes
- [Fix Documentation](docs/fixes/) — Detailed bug fix reports

## Prerequisites

You need Node.js (includes npm) installed on your system.

**Check if already installed:**
```bash
node --version
npm --version
```

**If not installed, choose your method:**

### Windows
```powershell
# Using winget (recommended)
winget install OpenJS.NodeJS.LTS

# Or download installer from:
# https://nodejs.org/
```

### macOS
```bash
# Using Homebrew
brew install node

# Or download installer from:
# https://nodejs.org/
```

### Linux
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm

# Fedora
sudo dnf install nodejs npm

# Arch Linux
sudo pacman -S nodejs npm
```

After installation, **restart your terminal** and verify: `node --version`

### Troubleshooting: "node is not recognized"

If you get this error after installing Node.js:

**Solution 1: Restart VS Code completely**
- Close ALL VS Code windows
- Reopen VS Code
- Open a new terminal

**Solution 2: Reload PATH in PowerShell (Windows)**
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
node --version
```

**Solution 3: Check Node.js installation path**
```bash
# Windows: Should be in
C:\Program Files\nodejs\

# Verify it's in PATH:
# Windows: Search "Environment Variables" → Edit PATH → Check if Node.js path exists
```

## Quick Start

### 1. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 2. Start the Application

```bash
# Start both servers (uses default configurations)
npm run dev          # Frontend on http://localhost:5173
cd server
npm run dev          # Backend on http://localhost:3001
```

### 2.1 Use the Example Test User (Optional)

This repository documents only demo credentials for testing and does not contain any production secrets.

- Email: `test@test.test`
- Password: `testtest`

Prepare the example database (PowerShell on Windows):

```powershell
# From repo root
cd "server"

# Ensure the backend uses the same DB file as seeding
$env:DATABASE_PATH = "$PWD\data\study-planner.db"

# 1) Create/reset the test user's password (creates user if missing)
node .\reset-password.cjs "test@test.test" "testtest"

# 2) Remove all other users and their data (keeps only test@test.test)
node .\clear-db-except-test.cjs "test@test.test"

# 3) Seed a comprehensive dataset (courses across semesters + sessions)
node .\seed-full-test-user.cjs "test@test.test"

# 4) Start backend (keep this terminal open)
$env:PORT = "3001"; $env:FRONTEND_URL = "http://localhost:5173"; npm run dev
```

Then open a new terminal for the frontend and run `npm run dev` from the repo root.

Verify via API (optional):

```powershell
$body = '{"email":"test@test.test","password":"testtest"}'
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -ContentType "application/json" -Body $body
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri "http://localhost:3001/api/courses" -Method Get -Headers $headers | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "http://localhost:3001/api/sessions" -Method Get -Headers $headers | ConvertTo-Json -Depth 3
```

Tip: If you previously used another DB path, ensure your backend terminal shows the DB path it loaded and that it matches `server\data\study-planner.db`.

#### Maintenance: Deduplicate Sessions
Use the helper script to remove exact duplicate sessions for a user.

```powershell
cd "server"
$env:DATABASE_PATH = "$PWD\data\study-planner.db"
node .\scripts\deduplicate-sessions.cjs "test@test.test"
```

## Calendar UX Updates
- Mobile calendar defaults to 4 days; toggle to 7 days in the header. Preference persists in `localStorage` (`calendar.mobileDaysPerView`).
- Overlapping sessions in the week view render side-by-side for clarity.

## Security & Secrets
- Only the demo user credentials (`test@test.test` / `testtest`) are intended to be public. Do not publish any other secrets.
- Always set and use `DATABASE_PATH` locally; do not commit `.env` files or absolute paths.
- Google OAuth credentials and API keys must be stored in `.env.local` files and never committed.

### 3. Create Your Account

1. Open http://localhost:5173 in your browser
2. Click "Register" and create a new account
3. Start planning your study schedule!

The app works immediately with default settings. Google Calendar sync is **optional** - see below to set it up.

---

## 🔗 Optional: Google Calendar Integration

Want to sync your study sessions with Google Calendar? Follow these steps:

### Prerequisites

1. Create a Google Cloud Project at https://console.cloud.google.com/
2. Enable the Google Calendar API
3. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173`

### Configuration

**Frontend** - Create `.env.local`:
```bash
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-google-api-key
```

**Backend** - Create `server/.env.local`:
```bash
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-this
DATABASE_PATH=./data/study-planner.db
NODE_ENV=development
```

For detailed setup instructions, see **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)**.

⚠️ **IMPORTANT:** Never commit `.env.local` files! They contain your credentials.

## 🛠️ Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express + SQLite + JWT authentication
- **Integration:** Google Calendar API with two-way sync
- **Build:** Vite with HMR, ESLint flat config, TypeScript strict mode

## 📝 License

This project is part of an academic program at IU International University of Applied Sciences.

## 🤝 Contributing

See [SECURITY.md](SECURITY.md) for security vulnerability reporting.
