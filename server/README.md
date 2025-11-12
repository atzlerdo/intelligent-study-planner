# Backend Setup Guide

## Prerequisites
- Node.js v18+ installed
- npm or yarn

## Quick Start

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and customize if needed:
```bash
cp .env.example .env
```

Default configuration:
- `PORT=3001` - Server port
- `DATABASE_PATH=./data/study-planner.db` - SQLite database file location
- `JWT_SECRET=dev-secret-key-123456` - JWT signing secret (⚠️ CHANGE IN PRODUCTION!)
- `NODE_ENV=development` - Environment mode

### 3. Start Development Server
```bash
npm run dev
```

The server will:
- Initialize SQLite database (creates `./data/study-planner.db`)
- Set up all tables automatically
- Start listening on http://localhost:3001

### 4. Verify Server is Running
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-11T13:45:00.000Z"
}
```

## API Endpoints

### Authentication

#### Register New User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "John Doe"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-1731330000000-abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password"
}
```

### Courses

All course endpoints require `Authorization: Bearer <token>` header.

#### Get All Courses
```http
GET /api/courses
Authorization: Bearer <token>
```

#### Create Course
```http
POST /api/courses
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Mathematics",
  "type": "written-exam",
  "ects": 5,
  "estimatedHours": 137.5,
  "estimatedEndDate": "2025-12-31",
  "examDate": "2025-12-15",
  "semester": 1
}
```

#### Update Course
```http
PUT /api/courses/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Advanced Mathematics",
  "ects": 6
}
```

#### Delete Course
```http
DELETE /api/courses/:id
Authorization: Bearer <token>
```

### Sessions

#### Get All Sessions
```http
GET /api/sessions
Authorization: Bearer <token>
```

#### Create Session
```http
POST /api/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "courseId": "course-123",
  "studyBlockId": "block-456",
  "date": "2025-11-15",
  "startTime": "09:00",
  "endTime": "11:00",
  "durationMinutes": 120,
  "notes": "Chapter 3 review"
}
```

#### Create Recurring Session
```http
POST /api/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "courseId": "course-123",
  "studyBlockId": "block-456",
  "date": "2025-11-15",
  "startTime": "09:00",
  "endTime": "11:00",
  "durationMinutes": 120,
  "recurrence": {
    "rrule": "FREQ=WEEKLY;COUNT=10;BYDAY=MO,WE",
    "dtstart": "2025-11-15",
    "count": 10
  }
}
```

#### Update Session
```http
PUT /api/sessions/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "completed": true,
  "completionPercentage": 85,
  "notes": "Completed chapter 3"
}
```

#### Delete Session
```http
DELETE /api/sessions/:id
Authorization: Bearer <token>
```

## Database Schema

### Users Table
- `id` (TEXT, PRIMARY KEY)
- `email` (TEXT, UNIQUE)
- `password_hash` (TEXT)
- `name` (TEXT)
- `created_at` (INTEGER)
- `updated_at` (INTEGER)

### Courses Table
- `id` (TEXT, PRIMARY KEY)
- `user_id` (TEXT, FOREIGN KEY)
- `name` (TEXT)
- `type` (TEXT: 'written-exam' | 'project')
- `ects` (INTEGER)
- `estimated_hours` (INTEGER)
- `completed_hours` (INTEGER)
- `scheduled_hours` (INTEGER)
- `progress` (INTEGER)
- `status` (TEXT: 'planned' | 'active' | 'completed')
- `estimated_end_date` (TEXT)
- `exam_date` (TEXT, nullable)
- `semester` (INTEGER, nullable)
- `created_at` (TEXT)
- `updated_at` (INTEGER)

### Scheduled Sessions Table
- `id` (TEXT, PRIMARY KEY)
- `user_id` (TEXT, FOREIGN KEY)
- `course_id` (TEXT, FOREIGN KEY, nullable)
- `study_block_id` (TEXT)
- `date` (TEXT)
- `start_time` (TEXT)
- `end_date` (TEXT, nullable)
- `end_time` (TEXT)
- `duration_minutes` (INTEGER)
- `completed` (INTEGER)
- `completion_percentage` (INTEGER)
- `notes` (TEXT, nullable)
- `last_modified` (INTEGER, nullable)
- `google_event_id` (TEXT, nullable)
- `google_calendar_id` (TEXT, nullable)
- `recurring_event_id` (TEXT, nullable)
- `is_recurrence_exception` (INTEGER)

### Recurrence Patterns Table
- `session_id` (TEXT, PRIMARY KEY, FOREIGN KEY)
- `rrule` (TEXT) - RFC 5545 RRULE string
- `dtstart` (TEXT) - ISO date
- `until` (TEXT, nullable) - ISO date
- `count` (INTEGER, nullable)
- `exdates` (TEXT, nullable) - JSON array of ISO dates

## Production Deployment

### Security Checklist
- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Use HTTPS only
- [ ] Enable rate limiting
- [ ] Set up proper CORS origins
- [ ] Use environment-specific `.env` files
- [ ] Never commit `.env` files to version control

### Build for Production
```bash
npm run build
npm start
```

### Database Backup
The SQLite database file (`./data/study-planner.db`) should be backed up regularly:
```bash
cp ./data/study-planner.db ./backups/study-planner-$(date +%Y%m%d).db
```

## Troubleshooting

### Port Already in Use
If port 3001 is in use, change `PORT` in `.env`:
```env
PORT=3002
```

### Database Locked
SQLite uses file locking. Ensure only one process accesses the database at a time.

### CORS Errors
Update `FRONTEND_URL` in `.env` to match your frontend URL:
```env
FRONTEND_URL=http://localhost:5173
```

## Development Tips

### Hot Reload
The server uses `tsx watch` for automatic restart on file changes.

### Database Reset
To start fresh:
```bash
rm -rf ./data
npm run dev  # Will recreate database
```

### View Database
Use a SQLite viewer like:
- [DB Browser for SQLite](https://sqlitebrowser.org/)
- [SQLite Viewer VS Code Extension](https://marketplace.visualstudio.com/items?itemName=qwtel.sqlite-viewer)
- Command line: `sqlite3 ./data/study-planner.db`

## Next Steps

1. **Frontend Integration**: Connect React app to API (see `../src/lib/api.ts`)
2. **Authentication UI**: Add login/register forms
3. **Data Migration**: Import existing localStorage data to backend
4. **Enhanced Security**: Add input validation, rate limiting, HTTPS
5. **Testing**: Add unit and integration tests
