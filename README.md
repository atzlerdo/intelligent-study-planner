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

## 🛠️ Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express + SQLite + JWT authentication
- **Integration:** Google Calendar API with two-way sync
- **Build:** Vite with HMR, ESLint flat config, TypeScript strict mode

## 📝 License

This project is part of an academic program at IU International University of Applied Sciences.

## 🤝 Contributing

See [SECURITY.md](SECURITY.md) for security vulnerability reporting.
