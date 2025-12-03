# Intelligent Study Planner - AI Coding Agent Instructions

## Project Overview
Full-stack study planning app for 180 ECTS Bachelor's program with JWT auth, SQLite backend, and Google Calendar two-way sync. 

**Current version:** v0.6.9 (active development - see `CHANGELOG.md` for recent critical fixes)

## Architecture Overview

### Tech Stack
**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + @react-oauth/google  
**Backend:** Node.js + Express + SQLite (sql.js) + JWT + bcryptjs + Zod validation  
**Build:** Vite (dev: port 5173), ESLint flat config, TypeScript strict mode

### State Architecture (CRITICAL)
**Single source of truth:** `App.tsx` manages ALL global state via `useState`  
**Data flow:** User action → API call → Backend DB → State update → Re-render  
**Auth:** JWT in localStorage (`authToken`), validated on EVERY API request, user-isolated queries  
**Backend:** `server/src/db.ts` schema (users, courses, scheduled_sessions, google_calendar_tokens)  
**Foreign keys:** ALL tables have `user_id` FK with CASCADE delete, enforced via `PRAGMA foreign_keys = ON`

### Progress Tracking System (MOST COMMON BUG SOURCE)
**Three-segment bars:** Completed (green) | Scheduled (yellow) | Remaining (gray)

**CRITICAL CALCULATION RULES** (see v0.6.5-v0.6.9 fixes in `CHANGELOG.md`):
1. `scheduledHours` = sum of **future incomplete sessions ONLY** (`date+endTime > now`)
2. `completedHours` = sum of **attended sessions** (NOT from backend - recalculate on load!)
3. Calculate at 3 points: initial load, session create/edit/delete, attendance tracking
4. Use `course.scheduledHours` as single source (NEVER recalculate in Dashboard)
5. Past sessions created retroactively must NEVER appear in scheduled hours

**Common mistakes:**
- Using date-only comparison (`session.date >= today`) → fails for past sessions on current day
- Trusting backend `scheduledHours` values → can be stale, always recalculate
- Recalculating scheduled hours in multiple places → causes race conditions

### Domain Models (`src/types/index.ts`)
```typescript
Course: status ('planned' → 'active' → 'completed'), scheduledHours, completedHours, progress%
ScheduledSession: courseId (null = unassigned), completed, googleEventId (for sync), endDate (multi-day)
```
**Course lifecycle:** Auto-activates on first session creation, deactivates when all sessions deleted

### Component Structure
- `src/components/ui/` - shadcn/ui primitives (Radix UI + CVA variants)
- `src/components/{sessions,courses,dashboard}/` - Feature modules
- `App.tsx` - 2600+ lines, manages ALL state and dialogs (attendance, feedback, replan)
- NO `@/` alias - use relative imports (`./ui/button`)

### Scheduling System (`src/lib/scheduler.ts`)
- **Auto**: `generateSchedule()` fills `StudyBlock[]` (weekly recurring slots)
- **Manual**: Drag-and-drop in `WeekCalendar.tsx` / `CalendarView.tsx`
- **Multi-day**: `endDate` field for overnight sessions, `calculateDuration()` handles cross-midnight logic

## Critical Workflows

### Session Lifecycle & Feedback Loop
1. User creates session → course auto-activates if `status === 'planned'`
2. Session end time passes → App detects via date comparison, shows `SessionAttendanceDialog`
3. If attended → `SessionFeedbackDialog` collects:
   - Actual hours worked
   - Self-assessed progress (0-100%)
   - Completed milestones
4. Updates propagate: `course.completedHours += actualHours`, `course.progress` recalculated

**Implementation note**: Date comparisons use local timezone (no UTC conversion) to match user's actual schedule.

### Study Progress Tracking
- **Three-segment progress bar**: Completed hours (green) | Scheduled hours (yellow) | Remaining hours (gray)
- **ECTS completion**: Marking course complete adds `course.ects` to `studyProgram.completedECTS`
- **Hours calculation**: `totalHours = ECTS × hoursPerECTS` (default: 27.5h per ECTS)

## Development Commands
```bash
npm run dev      # Start Vite dev server (port 5173)
npm run build    # TypeScript compile + Vite build
npm run lint     # ESLint with flat config format
```

## Styling Patterns

### Tailwind + CSS Variables
- Base styles in `src/styles/globals.css` using `@import "tailwindcss"`
- Custom properties for theme colors (`--primary`, `--destructive`, etc.)
- Dark mode supported via `.dark` class variants
- Responsive: mobile-first with `lg:` breakpoint for desktop layouts

### UI Component Library
- Built on Radix UI primitives for accessibility
- `class-variance-authority` (CVA) for variant composition (see `button.tsx`)
- `cn()` utility (`src/components/ui/utils.ts`) merges Tailwind classes with `tailwind-merge`

### Import Patterns
- UI components: `import { Button } from './ui/button'` (relative paths, no `@/` alias)
- Types: `import type { Course } from '../types'` (distinguish type imports)
- Icons: `lucide-react` for consistent iconography

### API Layer (`src/lib/api.ts`)
**All functions documented with comprehensive JSDoc comments**

**Authentication:**
- `register(email, password, name)` - Create new user
- `login(email, password)` - Authenticate, returns JWT token
- `logout()` - Clear auth token and cache
- JWT stored in `localStorage` as `authToken`

**Data Operations:**
- `getCourses()`, `createCourse()`, `updateCourse()`, `deleteCourse()`
- `getSessions()`, `createSession()`, `updateSession()`, `deleteSession()`
- `getStudyProgram()`, `updateStudyProgram()`
- All API calls include JWT token in `Authorization: Bearer <token>` header
- Backend validates token and filters by `userId`

**Google Calendar Tokens:**
- `getGoogleCalendarToken()` - Retrieve from backend (404 if none)
- `saveGoogleCalendarToken()` - Upsert to backend
- `deleteGoogleCalendarToken()` - Disconnect
- `updateLastSync()` - Track sync timestamp

## Testing/Debugging Patterns
- Mock data in `src/lib/mockSessions.ts` for development
- Console logging for session operations (see `handleSaveSession()` in `App.tsx`)
- Local development uses OneDrive-synced workspace (beware concurrent edits)
- `logs/` folder for debug output (git-ignored, never synced)
- Database file: `server/data/study-planner.db` (SQLite)
- Use DB Browser for SQLite or VS Code SQLite Viewer to inspect data

## Common Gotchas
1. **Date handling**: Always use local timezone strings (`YYYY-MM-DD`) without UTC conversion
2. **Backend sync**: State changes must call API to persist to database
3. **Dialog state cleanup**: Reset `editingSession`, `originalSessionBeforeMove`, `createSessionData` when closing dialogs
4. **Milestone tracking**: Milestones have no separate deadline enforcement—purely visual tracking
5. **Course activation**: Automatically activate `planned` courses when first session is created
6. **Auth required**: All API endpoints (except `/auth/register` and `/auth/login`) require valid JWT token
7. **User isolation**: Never query data without filtering by `user_id` in backend

## Google Calendar Integration

### Architecture
**Backend Token Storage (v0.5.0+):**
- OAuth tokens stored in database (`google_calendar_tokens` table)
- User-specific isolation via `user_id` foreign key
- Tokens persist across sessions and devices
- API endpoints: `/api/google-calendar/token` (GET/POST/DELETE/PATCH)

**Frontend Components:**
- `CalendarSync.tsx` - UI for OAuth login/disconnect
- `GoogleCalendarSyncService.tsx` - Background sync service (always mounted)
- Event-driven communication via custom `googleCalendarTokenChanged` event

### Two-Way Sync Implementation
- **OAuth Flow**: `@react-oauth/google` for authentication in `main.tsx`
- **Sync Logic**: `src/lib/googleCalendar.ts` handles bidirectional sync
- **Dedicated Calendar**: Creates "Intelligent Study Planner" calendar in user's Google account
- **Session Metadata**: Uses `extendedProperties` to track app source and session IDs
- **Debounce Protection**: 2-second delay prevents infinite sync loops
- **Incremental Sync**: Uses sync tokens to fetch only changes since last sync

### Setup Requirements
1. Google Cloud Project with Calendar API enabled
2. OAuth 2.0 credentials configured for `http://localhost:5173`
3. Environment variables in `.env`:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_API_KEY`
4. Backend validates and stores tokens securely

### Sync Triggers
- **Auto-sync**: Session changes (debounced 2s)
- **Periodic**: Every 5 minutes when connected
- **Tab visibility**: When user returns to app
- **Manual**: User clicks "Sync Now" button

### Sync Behavior
- **Push**: All `ScheduledSession[]` converted to calendar events
- **Pull**: Calendar events converted back to sessions (merged, not replaced)
- **Update**: Existing events updated by `sessionId` match
- **Delete**: Events removed from calendar if session deleted in app
- **Conflict Resolution**: Google Calendar is source of truth for imported events

### Known Limitations
- **localStorage cache keys not user-specific**: Event hashes, sync tokens stored globally
  - TODO: Include `userId` in cache keys to prevent cross-user cache pollution
- **No refresh token handling**: Tokens expire after ~1 hour, user must reconnect

## Code Documentation

**All critical files have comprehensive JSDoc-style comments:**
- `src/lib/api.ts` - Complete API client documentation
- `src/lib/scheduler.ts` - Scheduling algorithms explained
- `src/lib/googleCalendar.ts` - Sync architecture overview
- `src/components/GoogleCalendarSyncService.tsx` - Background sync logic
- `src/components/CalendarSync.tsx` - OAuth flow and UI
- `src/App.tsx` - Application architecture and state management
- `server/src/db.ts` - Database schema with table descriptions
- `server/src/auth.ts` - JWT authentication flow
- `server/src/routes/google-calendar.ts` - API endpoints

**Documentation Style:**
- Section headers with `============` separators
- Purpose explanations (what & why)
- Process flows (numbered steps)
- Parameter descriptions (@param tags)
- Return value docs (@returns tags)
- Code examples (@example tags)
- Architecture notes and security considerations

## Running the Application

**Development:**
```bash
# Frontend (port 5173)
npm run dev

# Backend (port 3001)
cd server
npm run dev
```

**Production Build:**
```bash
npm run build          # Frontend
cd server
npm run build         # Backend
npm start             # Start production server
```

**Environment Variables:**
- Frontend: `.env` with `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`
- Backend: `server/.env` with `JWT_SECRET`, `PORT`, `DATABASE_PATH`

## Extension Points
- **Data export/import**: Add CSV/JSON export for backup/migration
- **University API integration**: Connect to course catalogs (currently hardcoded)
- **Advanced scheduling**: Implement priority-based or ML-driven scheduling
- **Statistics dashboard**: Expand analytics in `Dashboard.tsx`
- **Refresh token handling**: Add automatic token refresh for Google Calendar
- **User-specific cache keys**: Fix localStorage cache isolation (see TODO in `googleCalendar.ts`)
- **Multi-language support**: Add i18n for international users
- **Mobile app**: React Native version with shared backend
