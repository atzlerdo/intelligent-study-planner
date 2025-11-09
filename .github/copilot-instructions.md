# Intelligent Study Planner - AI Coding Agent Instructions

## Project Overview
A React + TypeScript + Vite study planning app for managing university courses (180 ECTS Bachelor's program). State is fully client-side with localStorage persistence. No backend—all scheduling logic runs in the browser.

## Architecture

### State Management
- **Single-source-of-truth**: `App.tsx` manages all global state via React hooks (`useState`)
- **Persistence**: Critical data (`studyProgram`, `hasOnboarded`) stored in localStorage only—no backend
- **Data flow**: Parent state props drilled down to components (no context/Redux)

### Core Domain Models (`src/lib/types.ts`)
```typescript
Course {
  status: 'planned' | 'active' | 'completed'  // Lifecycle: planned → active (first session scheduled) → completed (manually marked)
  scheduledHours: number  // Auto-calculated from ScheduledSession[] 
  completedHours: number  // Updated via SessionFeedbackDialog
  semester: number  // 1-6 for Bachelor program structure
}

ScheduledSession {
  completed: boolean  // Set via SessionFeedbackDialog (attendance tracking)
  completionPercentage: number  // Self-assessment from feedback (0-100)
  endDate?: string  // For multi-day sessions spanning midnight
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

## Testing/Debugging Patterns
- Mock data in `src/lib/mockSessions.ts` for development
- Console logging for session operations (see `handleSaveSession()` in `App.tsx`)
- Local development uses OneDrive-synced workspace (beware concurrent edits)

## Common Gotchas
1. **Date handling**: Always use local timezone strings (`YYYY-MM-DD`) without UTC conversion
2. **Scheduled hours sync**: When deleting sessions, decrement `course.scheduledHours` manually
3. **Dialog state cleanup**: Reset `editingSession`, `originalSessionBeforeMove`, `createSessionData` when closing dialogs
4. **Milestone tracking**: Milestones have no separate deadline enforcement—purely visual tracking
5. **Course activation**: Automatically activate `planned` courses when first session is created

## Google Calendar Integration

### Two-Way Sync Implementation
- **OAuth Flow**: `@react-oauth/google` for authentication in `main.tsx`
- **Sync Logic**: `src/lib/googleCalendar.ts` handles bidirectional sync
- **Dedicated Calendar**: Creates "Intelligent Study Planner" calendar in user's Google account
- **Session Metadata**: Uses `extendedProperties` to track app source and session IDs

### Setup Requirements
1. Google Cloud Project with Calendar API enabled
2. OAuth 2.0 credentials configured for `http://localhost:5173`
3. Environment variables in `.env`:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_API_KEY`
4. See `CALENDAR_SETUP.md` for detailed setup instructions

### Sync Behavior
- Push: All `ScheduledSession[]` converted to calendar events
- Pull: Calendar events converted back to sessions (merged, not replaced)
- Update: Existing events updated by `sessionId` match
- Delete: Events removed from calendar if session deleted in app

## Extension Points
- Add data export/import (no backend planned, could use JSON files)
- Integrate with university APIs for course catalogs (currently hardcoded in `App.tsx`)
- Implement advanced scheduling algorithms (current: simple round-robin in `generateSchedule()`)
- Add statistics dashboard (foundation in `Dashboard.tsx` progress cards)
