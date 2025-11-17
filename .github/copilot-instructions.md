# Intelligent Study Planner - AI Coding Agent Instructions

## Project Overview
A full-stack React + TypeScript + Vite study planning app for managing university courses (180 ECTS Bachelor's program). Features JWT authentication, SQLite database backend, and Google Calendar integration for comprehensive study session management.

## Architecture

### Tech Stack
**Frontend:**
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui components
- @react-oauth/google for Google Calendar OAuth
- lucide-react for icons

**Backend:**
- Node.js + Express
- SQLite (via sql.js) for data persistence
- JWT authentication (jsonwebtoken + bcryptjs)
- Zod for API validation

**Development:**
- ESLint (flat config)
- TypeScript (strict mode)
- Vite dev server with HMR

### State Management
- **Single-source-of-truth**: `App.tsx` manages all global state via React hooks (`useState`)
- **Persistence**: All data stored in SQLite database via Express REST API
- **Authentication**: JWT tokens stored in localStorage, validated on every API request
- **Data flow**: Parent state → API calls → Database → State updates
- **User isolation**: All data queries filtered by authenticated user's ID

### Database Schema (`server/src/db.ts`)
**Primary Tables:**
- `users` - Authentication (email, password_hash, JWT)
- `courses` - Course data with lifecycle (planned → active → completed)
- `scheduled_sessions` - Study sessions with Google Calendar sync fields
- `study_blocks` - Recurring weekly time slots
- `study_programs` - Degree configuration (ECTS, hours per ECTS)
- `google_calendar_tokens` - OAuth tokens (user-specific)
- `recurrence_patterns` - RRULE data for recurring sessions
- `milestones` - Course sub-tasks

**Key Relationships:**
- All tables have `user_id` foreign key (CASCADE delete on user removal)
- `courses.user_id` → `users.id`
- `sessions.course_id` → `courses.id` (SET NULL for unassigned sessions)
- Foreign keys enforced via `PRAGMA foreign_keys = ON`

### Core Domain Models (`src/types/index.ts`)
```typescript
Course {
  id: string                  // UUID
  userId: string              // Foreign key
  status: 'planned' | 'active' | 'completed'  // Lifecycle
  scheduledHours: number      // Sum of session durations
  completedHours: number      // Tracked via SessionFeedbackDialog
  progress: number            // 0-100 percentage
  semester: number            // 1-6 for Bachelor program
  ects: number                // Credit points
  estimatedHours: number      // ects × hoursPerECTS
}

ScheduledSession {
  id: string                  // UUID
  userId: string              // Foreign key
  courseId: string | null     // null for unassigned/break sessions
  completed: boolean          // Attendance tracking
  completionPercentage: number // Self-assessment (0-100)
  endDate?: string            // Multi-day support
  googleEventId?: string      // For sync tracking
  recurringEventId?: string   // Link to parent recurring event
}
```

### Component Organization
- `components/ui/` - shadcn/ui primitives (button, dialog, card, etc.)
- `components/sessions/`, `components/courses/`, `components/dashboard/` - feature modules
- `components/layout/` - navigation and layout containers
- `WeekCalendar.tsx`, `CalendarView.tsx` - calendar views with drag-and-drop session editing

### Scheduling System (`src/lib/scheduler.ts`)
- **Auto-scheduling**: `generateSchedule()` distributes course hours across `StudyBlock[]` (recurring weekly time slots)
- **Manual scheduling**: Users create/edit `ScheduledSession` via drag-and-drop or dialogs
- **Multi-day support**: Sessions can span days via `endDate` field (e.g., night shift studying)
- **Duration calculation**: `calculateDuration()` handles same-day, over-midnight, and multi-day spans

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
