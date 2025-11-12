# Database Integration Guide

## Overview

The Intelligent Study Planner now includes a dedicated backend server with SQLite database for persistent data storage. This guide will help you set up and run the full stack locally.

## Architecture

```
┌─────────────────────────────────────────┐
│  React Frontend (Vite)                  │
│  Port: 5173                             │
│  - UI Components                        │
│  - Google Calendar Integration          │
│  - API Client (src/lib/api.ts)          │
└──────────────┬──────────────────────────┘
               │ HTTP/REST API
               │ JWT Authentication
┌──────────────▼──────────────────────────┐
│  Node.js Backend (Express)              │
│  Port: 3001                             │
│  - Authentication (JWT)                 │
│  - RESTful API                          │
│  - Business Logic                       │
└──────────────┬──────────────────────────┘
               │ SQL Queries
┌──────────────▼──────────────────────────┐
│  SQLite Database                        │
│  File: server/data/study-planner.db     │
│  - Users                                │
│  - Courses                              │
│  - Sessions                             │
│  - Study Blocks                         │
│  - Milestones                           │
└─────────────────────────────────────────┘
```

## Quick Start

### 1. Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Configure environment (optional, uses defaults)
cp .env.example .env

# Start development server
npm run dev
```

The backend will:
- Create SQLite database at `server/data/study-planner.db`
- Initialize all tables automatically
- Start on http://localhost:3001

### 2. Frontend Setup

```bash
# Navigate to project root
cd ..

# Install dependencies (if not already done)
npm install

# Configure API URL (optional, uses defaults)
cp .env.example .env

# Start development server
npm run dev
```

The frontend will start on http://localhost:5173

### 3. Test the Setup

Open your browser to http://localhost:5173 and:
1. Register a new user account
2. Log in
3. Create courses and study sessions
4. Data persists across refreshes!

## What's New?

### Backend Features
- **User Authentication**: Secure JWT-based login/registration
- **RESTful API**: Clean HTTP endpoints for all operations
- **SQLite Database**: Local file-based database (no server setup needed)
- **Automatic Schema**: Database tables created on first run
- **Hot Reload**: Server restarts automatically during development

### Frontend Changes
- **API Client** (`src/lib/api.ts`): Type-safe API wrapper
- **Authentication Flow**: Login/register components (to be implemented)
- **Token Management**: Automatic JWT handling
- **Error Handling**: Better API error feedback

### Database Schema
- **users**: Authentication and user profiles
- **courses**: Course information and progress
- **scheduled_sessions**: Study sessions (with recurrence support)
- **milestones**: Course milestones and deadlines
- **study_blocks**: Weekly study time blocks
- **recurrence_patterns**: RRULE patterns for recurring sessions

## Development Workflow

### Run Both Servers Concurrently

Terminal 1 (Backend):
```bash
cd server
npm run dev
```

Terminal 2 (Frontend):
```bash
npm run dev
```

### API Testing

Test backend endpoints with curl:

```bash
# Health check
curl http://localhost:3001/health

# Register user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'

# Login (save the token from response)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Get courses (use token from login)
curl http://localhost:3001/api/courses \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Database Inspection

View database contents:

#### Option 1: DB Browser for SQLite
1. Download from https://sqlitebrowser.org/
2. Open `server/data/study-planner.db`
3. Browse tables and data

#### Option 2: SQLite CLI
```bash
sqlite3 server/data/study-planner.db
.tables
SELECT * FROM users;
.exit
```

#### Option 3: VS Code Extension
1. Install "SQLite Viewer" extension
2. Right-click `study-planner.db` → Open With → SQLite Viewer

## Migration from LocalStorage

To migrate existing data from localStorage to the database:

1. **Export localStorage data** (browser console):
```javascript
const data = {
  courses: JSON.parse(localStorage.getItem('studyProgram') || '{}'),
  sessions: JSON.parse(localStorage.getItem('scheduledSessions') || '[]'),
};
console.log(JSON.stringify(data, null, 2));
// Copy the output
```

2. **Import via API**:
```typescript
// Create a migration script or use the API client
import { createCourse, createSession } from './src/lib/api';

// For each course and session, call the API
await createCourse(courseData);
await createSession(sessionData);
```

## Troubleshooting

### Backend won't start
- **Port 3001 in use**: Change `PORT` in `server/.env`
- **Database locked**: Close any SQLite viewers/editors
- **Dependencies missing**: Run `cd server && npm install`

### Frontend can't connect to backend
- **CORS error**: Verify `VITE_API_URL` in frontend `.env`
- **Backend not running**: Start with `cd server && npm run dev`
- **Wrong port**: Check backend is on port 3001

### Authentication issues
- **Token expired**: Tokens expire after 7 days, log in again
- **Invalid credentials**: Check email/password
- **No token**: Ensure login response includes `token` field

### Database reset needed
```bash
# Delete database file
rm server/data/study-planner.db

# Restart server (will recreate)
cd server && npm run dev
```

## Project Structure

```
intelligent-study-planner/
├── server/                    # Backend
│   ├── src/
│   │   ├── index.ts          # Express app entry
│   │   ├── db.ts             # Database initialization
│   │   ├── auth.ts           # JWT middleware
│   │   └── routes/           # API endpoints
│   │       ├── auth.ts       # Auth endpoints
│   │       ├── courses.ts    # Course CRUD
│   │       └── sessions.ts   # Session CRUD
│   ├── data/                 # SQLite database (generated)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                  # Backend config
│   └── README.md             # Backend docs
├── src/                      # Frontend
│   ├── lib/
│   │   ├── api.ts           # NEW: API client
│   │   ├── googleCalendar.ts
│   │   └── types.ts
│   ├── components/
│   └── App.tsx
├── package.json              # Frontend dependencies
├── .env                      # Frontend config
└── DATABASE_SETUP.md         # This file
```

## Next Steps

### Immediate
- [ ] Implement login/register UI components
- [ ] Replace localStorage calls with API calls in App.tsx
- [ ] Add loading states during API requests
- [ ] Display API errors to users

### Short Term
- [ ] Add study blocks API endpoints
- [ ] Implement data migration utility
- [ ] Add offline support with service workers
- [ ] Sync Google Calendar events to database

### Long Term
- [ ] Multi-user support with proper isolation
- [ ] Advanced analytics and reporting
- [ ] Real-time updates via WebSockets
- [ ] Mobile app (React Native)
- [ ] Cloud deployment (Vercel + PlanetScale/Supabase)

## API Documentation

Full API documentation available in `server/README.md`

Key endpoints:
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `GET /api/courses` - List courses
- `POST /api/courses` - Create course
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session

All endpoints (except auth) require `Authorization: Bearer <token>` header.

## Support

For issues or questions:
1. Check server logs in terminal running `npm run dev`
2. Check browser console for frontend errors
3. Review `server/README.md` for detailed API docs
4. Inspect database with SQLite viewer

Happy studying! 📚
