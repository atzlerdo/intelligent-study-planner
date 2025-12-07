# Intelligent Study Planner

A full-stack study planning application for managing university courses with Google Calendar integration.

## 📚 Documentation

- **[Setup Guide](docs/SETUP_GUIDE.md)** - Complete installation and configuration instructions
- **[Security Policy](SECURITY.md)** - Security best practices and vulnerability reporting
- **[Tech Stack](docs/TECH_STACK.md)** - Technologies and frameworks used
- **[Project Overview](docs/PROJECT_OVERVIEW.md)** - Architecture and design decisions
- **[Changelog](CHANGELOG.md)** - Version history and changes
- **[Fix Documentation](docs/fixes/)** - Detailed bug fix reports

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
