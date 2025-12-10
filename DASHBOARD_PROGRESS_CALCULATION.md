# Dashboard Progress Calculation

This document explains how the Dashboard calculates and displays study progress in hours and ECTS, covering completed, scheduled, and remaining segments.

## Overview

- Three-segment progress bar:
  - Completed (green)
  - Scheduled (yellow)
  - Remaining (gray)
- ECTS counter: `completedECTS / totalECTS`

## Inputs

- Courses: loaded from backend via `/api/courses`
  - `status`: `planned | active | completed`
  - `ects`, `estimatedHours`, `completedHours`, `scheduledHours`
- Sessions: loaded from backend via `/api/sessions`
  - `completed` (boolean), `durationMinutes`, `date`, `startTime`, `endTime`, `courseId`
- Study Program: loaded from `/api/study-program`
  - `totalECTS`, `completedECTS`, `hoursPerECTS` (default 27.5)

## Core Rules

1. Scheduled Hours (yellow)
   - Sum of future, incomplete sessions ONLY.
   - Source of truth: `course.scheduledHours` (calculated by the app on load and on session changes);
   - Plus unassigned future sessions (no `courseId`) counted into yellow segment.

2. Completed Hours (green)
   - Sum of attended sessions (from session data) across all courses.
   - Visual fallback for completed courses without session logs: add `ects × hoursPerECTS`.
   - Initial achievements: If the user starts mid-studies and backend `completedECTS` is `0`, the app derives `completedECTS` from courses with `status === 'completed'` and persists it.

3. Remaining Hours (gray)
   - `totalHours - completedHours - scheduledHours`
   - `totalHours = totalECTS × hoursPerECTS`

## Active Courses List (Dashboard)

- Shows non-completed courses that have at least one session.
- Includes unassigned sessions in scheduling calculations but not in the active course list.

## ECTS Normalization (Mid-Study Users)

- On initial load, if `studyProgram.completedECTS` from the backend is zero, the app calculates:
  - `completedECTSFromCourses = sum(ects) for courses where status === 'completed'`
  - Sets `studyProgram.completedECTS = completedECTSFromCourses`, and persists this back via `/api/study-program`.

## Time Zone and Dates

- All date comparisons use local time strings in `YYYY-MM-DD` without UTC conversion.
- Avoid date-only comparisons for sessions on the current day; use `date + endTime` for future/past checks.

## Known Limitations

- If a course is marked completed but lacks session logs, the green segment uses the baseline `ects × hoursPerECTS`; adding real session attendance will replace this baseline with accurate hours.
- `scheduledHours` must not be recomputed arbitrarily in the Dashboard; the app updates it centrally to prevent race conditions.

## References

- `src/App.tsx`: initial load normalization and scheduled/completed hours recalculation.
- `src/components/dashboard/Dashboard.tsx`: progress bar rendering logic and visual fallback for completed courses.
- `src/lib/api.ts`: API endpoints used to fetch courses, sessions, and study program.
