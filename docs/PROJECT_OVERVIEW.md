# Intelligent Study Planner - Project Overview

## What Does This Project Do?

**Intelligent Study Planner** is a full-stack web application that helps university students manage their Bachelor's degree coursework (180 ECTS) by:

- **Course Management**: Track courses with ECTS credits, exam dates, progress tracking, and lifecycle states (planned ? active ? completed)
- **Smart Scheduling**: Automatically distribute study hours across weekly time blocks or manually create sessions
- **Progress Tracking**: Visual progress bars showing completed/scheduled/remaining hours with self-assessment feedback
- **Google Calendar Integration**: Two-way sync - sessions sync to Google Calendar and calendar events import back to the app
- **Session Feedback**: After each session ends, capture actual hours worked, progress made, and completed milestones
- **Multi-day Support**: Sessions can span multiple days (e.g., night shift studying)

## Tech Stack

### Frontend
- **React 18** + **TypeScript** + **Vite** (fast HMR development)
- **Tailwind CSS** + **shadcn/ui** (accessible component library)
- **@react-oauth/google** (OAuth 2.0 for Google Calendar)
- **Framer Motion** (drag-and-drop session editing)

### Backend
- **Node.js** + **Express** (REST API)
- **SQLite** via **sql.js** (WebAssembly-based database)
- **JWT authentication** (jsonwebtoken + bcryptjs)
- **Zod** (API request validation)

### Development Tools
- **ESLint** (strict TypeScript rules, flat config)
- **TypeScript** strict mode
- **Git** (GitHub: atzlerdo/intelligent-study-planner)

## Architecture Overview

### State Management
```
+----------------+
|    App.tsx     |  <-- Single source of truth (useState hooks)
+----------------+
        |
        +--> API calls (src/lib/api.ts)
        |         |
        |         v
        |   Express Backend (server/src/)
        |         |
        |         v
        |   SQLite Database (server/data/study-planner.db)
        |
        +--> Child Components (props drilling)
              - Dashboard, CoursesView, WeekCalendar, etc.
```

### Authentication Flow
1. User registers/logs in ? Backend generates JWT token
2. Token stored in `localStorage` as `authToken`
3. All API requests include `Authorization: Bearer <token>` header
4. Backend validates token and extracts `userId` for data isolation
5. Token persists across browser sessions (auto-login)

### Database Schema (User-Isolated)
```sql
users (id, email, password_hash, created_at)
  +-? courses (user_id, name, ects, status, progress, completed_hours, ...)
        +-? milestones (course_id, title, deadline, completed)
  +-? scheduled_sessions (user_id, course_id, date, start_time, end_time, completed, ...)
  +-? study_blocks (user_id, day_of_week, start_time, end_time) -- recurring slots
  +-? study_programs (user_id, total_ects, completed_ects, hours_per_ects)
  +-? google_calendar_tokens (user_id, access_token, refresh_token, calendar_id, ...)
```

**Key Design**: All tables have `user_id` foreign key with `CASCADE DELETE` ? deleting a user removes all their data.

## Core Workflows

### 1. Onboarding Flow
```
New User ? Register ? Set Study Program (180 ECTS, 27.5h/ECTS)
       ? Create First Course ? System shows onboarding dialog
```

### 2. Course Lifecycle
```
PLANNED ? (create first session) ? ACTIVE ? (mark complete) ? COMPLETED
         ?                                    ?
         +------ (delete all sessions) -------+
```
- **Planned**: No sessions scheduled yet
- **Active**: Has scheduled sessions (auto-activated)
- **Completed**: User marks done, ECTS added to program total

### 3. Session Scheduling
**Manual**:
- Drag-and-drop on `WeekCalendar.tsx` or click "Add Session"
- `SessionDialog` captures: date, time, course, duration, notes
- Saves to backend ? updates state

**Auto-Scheduling** (`src/lib/scheduler.ts`):
- User defines `StudyBlock[]` (e.g., Mon-Fri 18:00-20:00)
- Algorithm distributes course hours across blocks
- Respects exam dates (prioritizes nearby deadlines)

### 4. Session Feedback Loop
```
Session End Time Passes ? SessionAttendanceDialog appears
   ?
Attended?
   +- Yes ? SessionFeedbackDialog (actual hours, progress %, milestones)
   ¦         ? Update course.completedHours, course.progress
   ¦         ? Mark session.completed = true
   ¦
   +- No ? Choose:
            +- Delete session (no replan)
            +- Move to other free study sessions (automatic replan)
```

**Missed Session Replanning (current behavior)**
- When a past session was not attended, the app now collects multiple upcoming unassigned study sessions until the full missed duration is covered (over-planning allowed).
- All collected slots are reassigned to the missed session's course in one step.
- If there are not enough unassigned slots to cover the missed minutes, a warning is shown and the session is marked as not attended (no partial reassignment).

### 5. Google Calendar Sync (v0.6.0)
**Setup**:
1. User clicks "Connect Google Calendar" ? OAuth flow
2. Backend stores tokens in `google_calendar_tokens` table
3. Frontend mounts `GoogleCalendarSyncService` component (always active)

**Bidirectional Sync**:
```
App Sessions --push--? Google Calendar
              ?-pull--
```
- **Push**: All sessions ? calendar events (with `extendedProperties` metadata)
- **Pull**: Calendar events ? sessions (merge, don't replace)
- **Triggers**: Session changes (2s debounce), every 5min, tab focus, manual click
- **Conflict Resolution**: Google Calendar is source of truth for imported events

**Known Limitation**: localStorage cache keys not user-specific (TODO: add `userId` prefix)

## Project Structure

```
intelligent-study-planner/
+-- src/
¦   +-- App.tsx                      ? Main app, all state management
¦   +-- main.tsx                     ? Entry point, Google OAuth provider
¦   +-- components/
¦   ¦   +-- auth/AuthScreen.tsx      ? Login/Register UI
¦   ¦   +-- dashboard/Dashboard.tsx  ? Statistics overview
¦   ¦   +-- courses/
¦   ¦   ¦   +-- CoursesView.tsx      ? Course list with progress bars
¦   ¦   ¦   +-- CourseDialog.tsx     ? Add/Edit course form
¦   ¦   +-- sessions/
¦   ¦   ¦   +-- SessionDialog.tsx           ? Add/Edit session form
¦   ¦   ¦   +-- SessionAttendanceDialog.tsx ? "Did you attend?" prompt
¦   ¦   ¦   +-- SessionFeedbackDialog.tsx   ? Progress tracking form
¦   ¦   +-- WeekCalendar.tsx         ? Drag-and-drop weekly view
¦   ¦   +-- CalendarView.tsx         ? Month/week calendar switcher
¦   ¦   +-- CalendarSync.tsx         ? Google Calendar connection UI
¦   ¦   +-- GoogleCalendarSyncService.tsx ? Background sync logic
¦   ¦   +-- ui/                      ? shadcn/ui primitives (button, dialog, etc.)
¦   +-- lib/
¦   ¦   +-- api.ts                   ? Backend API client (all CRUD operations)
¦   ¦   +-- scheduler.ts             ? Auto-scheduling algorithms
¦   ¦   +-- googleCalendar.ts        ? Google Calendar API integration
¦   ¦   +-- hooks/
¦   ¦       +-- useGoogleCalendarSync.ts ? OAuth hook
¦   +-- types/index.ts               ? TypeScript interfaces
¦   +-- styles/globals.css           ? Tailwind + CSS variables
¦
+-- server/
¦   +-- src/
¦   ¦   +-- index.ts                 ? Express app entry point
¦   ¦   +-- db.ts                    ? Database initialization + schema
¦   ¦   +-- auth.ts                  ? JWT middleware
¦   ¦   +-- routes/
¦   ¦       +-- auth.ts              ? /auth/register, /auth/login
¦   ¦       +-- courses.ts           ? CRUD for courses
¦   ¦       +-- sessions.ts          ? CRUD for sessions
¦   ¦       +-- study-program.ts     ? Study program config
¦   ¦       +-- google-calendar.ts   ? Token management
¦   ¦       +-- admin.ts             ? User cleanup utilities
¦   +-- data/study-planner.db        ? SQLite database file
¦   +-- check-user.js                ? CLI: Check user data
¦   +-- list-users.js                ? CLI: List all users
¦   +-- delete-test-users.js         ? CLI: Cleanup test accounts
¦   +-- show-all-data.js             ? CLI: Comprehensive data dump
¦
+-- .github/copilot-instructions.md  ? AI agent guide
+-- CHANGELOG.md                     ? User-facing release notes
+-- V0.6.0_RELEASE_NOTES.md          ? Technical v0.6.0 documentation
+-- PROJECT_OVERVIEW.md              ? This file
+-- package.json                     ? Frontend dependencies
+-- server/package.json              ? Backend dependencies
```

## Getting Started (New Developer Guide)

### Prerequisites
- **Node.js** 18+ (npm included)
- **Git** for version control
- **VS Code** (recommended) with ESLint extension
- **Google Cloud Project** with Calendar API enabled (for OAuth)

### Initial Setup

1. **Clone Repository**
```bash
git clone https://github.com/atzlerdo/intelligent-study-planner.git
cd intelligent-study-planner
```

2. **Install Dependencies**
```bash
# Frontend
npm install

# Backend
cd server
npm install
cd ..
```

3. **Environment Configuration**

**Frontend** (`.env`):
```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
VITE_GOOGLE_API_KEY=your-google-api-key
```

**Backend** (`server/.env`):
```env
PORT=3001
JWT_SECRET=your-secret-key-here
DATABASE_PATH=./data/study-planner.db
```

4. **Start Development Servers**

**Terminal 1 - Backend**:
```bash
cd server
npm run dev  # Runs on http://localhost:3001
```

**Terminal 2 - Frontend**:
```bash
npm run dev  # Runs on http://localhost:5173
```

### Development Workflow

**Before Making Changes**:
1. Pull latest from main: `git pull origin main`
2. Create feature branch: `git checkout -b feature/your-feature-name`

**During Development**:
1. Make changes with hot reload (Vite HMR)
2. Test in browser: `http://localhost:5173`
3. Check lint: `npm run lint` (must pass with 0 errors/warnings)
4. Build test: `npm run build` (TypeScript must compile)

**After Changes**:
1. Stage files: `git add .`
2. Commit: `git commit -m "Brief description of changes"`
3. Push: `git push origin feature/your-feature-name`
4. Create Pull Request on GitHub

### Key Concepts to Understand

#### 1. User Data Isolation
Every API endpoint filters by `userId` extracted from JWT token. Never query data without `WHERE user_id = ?` to prevent data leaks.

#### 2. State Synchronization
```javascript
// Pattern: Update backend FIRST, then refresh local state
await apiUpdateCourse(id, data);            // Backend update
const freshCourses = await apiGetCourses(); // Fetch fresh data
setCourses(freshCourses);                   // Update React state
```

#### 3. Course Auto-Activation
When creating a session, check if course is `planned` ? auto-activate:
```javascript
if (course.status === 'planned') {
  await apiUpdateCourseExtended(course.id, { status: 'active' });
}
```

#### 4. Session Duration Calculation
Handle multi-day sessions using `calculateDuration()` from `scheduler.ts`:
- Same day: `endTime - startTime`
- Overnight: Calculate across midnight boundary
- Multi-day: Use `endDate` field

#### 5. Google Calendar Sync Protection
Use debouncing (2s delay) and promise caching to prevent duplicate syncs:
```typescript
// In googleCalendar.ts
const syncSessionsPromiseCache = new Map<string, Promise<void>>();
```

#### 6. Missed Session Replanning
- Functionality lives in `src/App.tsx` (attendance flow).
- On "not attended", the app collects future unassigned study sessions until the missed duration is fully covered; all collected slots are reassigned to the missed course.
- If coverage is insufficient, the user is informed and the session is marked not attended (no partial move). Add unassigned sessions to the calendar to enable automatic replanning.

### Common Tasks

**Add a New API Endpoint**:
1. Define route in `server/src/routes/[resource].ts`
2. Add JWT middleware: `router.get('/path', authenticateToken, handler)`
3. Extract userId: `const userId = (req.user as JwtPayload).userId`
4. Add function to `src/lib/api.ts` with JSDoc comments
5. Import in `App.tsx` and use in component

**Add a New Component**:
1. Create in appropriate folder: `src/components/[feature]/`
2. Use TypeScript: `interface MyComponentProps { ... }`
3. Import shadcn/ui components: `import { Button } from '../ui/button'`
4. Pass data via props (no global state library)

**Modify Database Schema**:
1. Update `server/src/db.ts` schema
2. Delete `server/data/study-planner.db` (dev only!)
3. Restart backend ? schema auto-creates
4. Update TypeScript interfaces in `src/types/index.ts`

**Debug Database Issues**:
```bash
cd server
node check-user.js email@example.com    # Check specific user
node list-users.js                      # List all users
node show-all-data.js                   # Full data dump
```

### Testing Checklist

Before committing:
- [ ] `npm run lint` passes (0 errors, 0 warnings)
- [ ] `npm run build` succeeds (TypeScript compiles)
- [ ] Login/logout works
- [ ] Course CRUD operations work
- [ ] Session creation/editing works
- [ ] Google Calendar sync functions (if modified)
- [ ] Missed-session replanning still works (auto assigns multiple slots, warns on shortage)
- [ ] Multi-user isolation verified (test with 2 accounts)
- [ ] Browser console has no errors

### Important Files to Read First

1. `PROJECT_OVERVIEW.md` (this file) - Full architecture
2. `.github/copilot-instructions.md` - AI agent development guide
3. `V0.6.0_RELEASE_NOTES.md` - Latest changes and patterns
4. `src/App.tsx` lines 1-60 - JSDoc explains app architecture
5. `src/lib/api.ts` - All backend API functions (comprehensive JSDoc)
6. `src/lib/googleCalendar.ts` - Sync logic architecture
7. `server/src/db.ts` - Database schema and tables

### Code Style Guidelines

**TypeScript**:
- Use `interface` for object shapes
- Avoid `any` (use `unknown` + type guards for errors)
- Use `Partial<T>` for optional update fields
- Import types with `import type { ... }`

**React**:
- Functional components only (no class components)
- Props drilling (no Context API unless needed)
- Use `useState` for component state
- Include all dependencies in `useEffect` arrays

**API Calls**:
- Always use `try/catch` blocks
- Refresh state after mutations: `const fresh = await apiGet...()`
- Use `apiUpdateCourseExtended` for status/progress/hours fields

**Comments**:
- JSDoc for all functions in `src/lib/`
- Inline comments for complex logic; explain WHY, not just WHAT

### Gotchas & Known Issues

1. **Date Handling**: Always use local timezone (`YYYY-MM-DD`), no UTC conversion
2. **Google Calendar Cache**: Not user-specific (TODO: add `userId` prefix)
3. **React StrictMode**: Effects run twice in dev (use promise caching)
4. **OneDrive Sync**: Database in OneDrive folder, beware concurrent edits
5. **Session Feedback**: Only shows when session end time has passed (date comparison)

### Getting Help

**Resources**:
- **Backend API**: JSDoc in `src/lib/api.ts`
- **Component Library**: https://ui.shadcn.com
- **Google Calendar API**: https://developers.google.com/calendar/api
- **SQLite**: https://sql.js.org

**Debug Tools**:
- Browser DevTools: Network tab (see API calls), Console (errors), Application ? localStorage
- Backend logs: `console.log` in `server/src/` (watch terminal)
- Database inspection: Use CLI scripts or https://sqlitebrowser.org

---

**Current Version**: v0.6.0 (November 2025)
**Status**: Active development, production-ready core features
**Maintainer**: atzlerdo@gmail.com
