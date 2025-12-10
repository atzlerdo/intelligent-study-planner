/**
 * ============================================================================
 * INTELLIGENT STUDY PLANNER - Main Application Component
 * ============================================================================
 * 
 * Root component that manages all application state and coordinates between:
 * - Authentication (login/logout)
 * - Study program setup (onboarding)
 * - Courses, sessions, and study blocks (CRUD operations)
 * - Google Calendar synchronization
 * - Session attendance and feedback tracking
 * - Multi-view navigation (dashboard, courses, calendar)
 * 
 * STATE ARCHITECTURE:
 * - All state stored in backend database (SQLite via Express API)
 * - JWT authentication for user-specific data isolation
 * - State synchronized with backend on every operation
 * - Legacy localStorage keys used for migration only
 * 
 * DATA FLOW:
 * 1. User authenticates → JWT token stored in localStorage
 * 2. App loads user data from backend (courses, sessions, study blocks, program)
 * 3. User modifies data → immediate API call to backend
 * 4. Backend returns updated data → local state updated
 * 5. Google Calendar sync triggered if connected
 * 
 * KEY FEATURES:
 * - Automatic session attendance tracking (checks for past sessions)
 * - Missed session replanning (move to different time slot)
 * - Course status lifecycle: planned → active → completed
 * - Three-segment progress tracking (completed/scheduled/remaining hours)
 * - ECTS completion tracking for degree progress
 * - Multi-day session support (sessions spanning midnight)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { SessionAttendanceDialog } from './components/sessions/SessionAttendanceDialog';
import { SessionFeedbackDialog } from './components/sessions/SessionFeedbackDialog';
import { PastSessionsReviewDialog } from './components/sessions/PastSessionsReviewDialog';
import { BottomNavigation } from './components/layout/BottomNavigation';
import { CoursesView, CoursesViewAddButton } from './components/courses/CoursesView';
import { CourseDialog } from './components/courses/CourseDialog';
import { StudyBlockDialog } from './components/StudyBlockDialog';
import { SessionDialog } from './components/SessionDialog';
import { OnboardingDialog } from './components/OnboardingDialog';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog';
import type { Course, StudyBlock, StudyProgram, ScheduledSession } from './types/index';
import { isAuthenticated, migrateIfEmpty, logout, createCourse as apiCreateCourse, updateCourse as apiUpdateCourse, updateCourseExtended as apiUpdateCourseExtended, deleteCourse as apiDeleteCourse, createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession, getCourses as apiGetCourses, getSessions as apiGetSessions, getStudyProgram as apiGetStudyProgram, updateStudyProgram as apiUpdateStudyProgram } from './lib/api';
import type { AuthResponse } from './lib/api';
import { AuthScreen } from './components/auth/AuthScreen';
import { calculateWeeklyAvailableMinutes, calculateEstimatedEndDate, calculateDuration } from './lib/scheduler';
import type { RecurrencePattern } from './components/RecurrencePatternPicker';
import { generateMockSessions } from './lib/mockSessions';

function App() {
  // View & sync triggers
  const [currentView, setCurrentView] = useState<'dashboard' | 'courses'>('dashboard');
  const [autoSyncTrigger, setAutoSyncTrigger] = useState<number>(0);

  // Dialog visibility states
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [showPastSessionsReview, setShowPastSessionsReview] = useState<boolean>(false);
  const [showAttendanceDialog, setShowAttendanceDialog] = useState<boolean>(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState<boolean>(false);
  const [showReplanDialog, setShowReplanDialog] = useState<boolean>(false);
  const [replanCandidates, setReplanCandidates] = useState<ScheduledSession[]>([]); // Sessions selected for replanning
  const [replanTotalMinutes, setReplanTotalMinutes] = useState(0);           // Total minutes covered by candidates
  const [missedSession, setMissedSession] = useState<ScheduledSession | null>(null); // Original missed session
  const [replanHandled, setReplanHandled] = useState(false);                 // Flag to prevent duplicate replan prompts
  // Track current authenticated user ID for per-user onboarding keys
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Merge helper to preserve local Google-moved sessions when backend data lags
  const mergeSessionsPreserveGoogle = (
    localSessions: ScheduledSession[],
    incomingSessions: ScheduledSession[],
    protectIds: Set<string> = new Set()
  ): ScheduledSession[] => {
    const localById = new Map(localSessions.map(s => [s.id, s]));
    const incomingById = new Map(incomingSessions.map(s => [s.id, s]));

    const merged = incomingSessions.map(incoming => {
      const local = localById.get(incoming.id);
      if (!local) return incoming;

      const isProtected = protectIds.has(incoming.id);
      const localLast = local.lastModified ?? 0;
      const incomingLast = incoming.lastModified ?? 0;

      // Keep Google-linked sessions (or protected ones) at their local position when local is as new or newer
      if (isProtected || local.googleEventId) {
        const latest = Math.max(localLast, incomingLast, Date.now());
        console.log('🔄 merge: keeping local Google/target session', {
          id: incoming.id,
          isProtected,
          localLast,
          incomingLast,
          chosenLast: latest,
          localDate: `${local.date} ${local.startTime}-${local.endTime}`,
          incomingDate: `${incoming.date} ${incoming.startTime}-${incoming.endTime}`,
          // CRITICAL: Attendance data from backend
          '🚨 LOCAL completed': local.completed,
          '✅ INCOMING completed': incoming.completed,
          '🎯 WILL USE': incoming.completed,
          '🚨 LOCAL courseId': local.courseId,
          '✅ INCOMING courseId': incoming.courseId,
          '🎯 WILL USE courseId': incoming.courseId,
        });
        return {
          ...incoming,
          ...local,
          // CRITICAL FIX: Backend is source of truth for attendance tracking AND course assignments
          completed: incoming.completed,
          completionPercentage: incoming.completionPercentage,
          courseId: incoming.courseId,
          date: local.date,
          startTime: local.startTime,
          endTime: local.endTime,
          endDate: local.endDate,
          googleEventId: local.googleEventId ?? incoming.googleEventId,
          lastModified: latest,
        };
      }

      // If local is fresher overall, prefer it (but keep incoming google ids if local missing)
      if (localLast > incomingLast) {
        console.log('🔄 merge: preferring fresher local session', {
          id: incoming.id,
          localLast,
          incomingLast,
          localDate: `${local.date} ${local.startTime}-${local.endTime}`,
          incomingDate: `${incoming.date} ${incoming.startTime}-${incoming.endTime}`,
          // CRITICAL: Attendance data from backend
          '🚨 LOCAL completed': local.completed,
          '✅ INCOMING completed': incoming.completed,
          '🎯 WILL USE': incoming.completed,
          '🚨 LOCAL courseId': local.courseId,
          '✅ INCOMING courseId': incoming.courseId,
          '🎯 WILL USE courseId': incoming.courseId,
        });
        return {
          ...incoming,
          ...local,
          // CRITICAL FIX: Backend is source of truth for attendance tracking AND course assignments
          completed: incoming.completed,
          completionPercentage: incoming.completionPercentage,
          courseId: incoming.courseId,
          googleEventId: local.googleEventId ?? incoming.googleEventId,
          googleCalendarId: local.googleCalendarId ?? incoming.googleCalendarId,
        };
      }

      console.log('🔄 merge: using incoming session', {
        id: incoming.id,
        localLast,
        incomingLast,
        localDate: `${local.date} ${local.startTime}-${local.endTime}`,
        incomingDate: `${incoming.date} ${incoming.startTime}-${incoming.endTime}`,
      });
      return incoming;
    });

    // Preserve local-only sessions that aren't in the incoming set
    for (const local of localSessions) {
      if (!incomingById.has(local.id)) {
        merged.push(local);
      }
    }

    return merged;
  };

  // Utility: Recalculate scheduled/completed hours and progress from sessions
  const recalcCourseHours = (coursesIn: Course[], sessionsIn: ScheduledSession[]): Course[] => {
    const now = new Date();
    const scheduledHoursByCourse = new Map<string, number>();
    const completedHoursByCourse = new Map<string, number>();
    for (const s of sessionsIn) {
      if (!s.courseId) continue;
      const end = new Date(`${s.date}T${s.endTime}`);
      const hours = s.durationMinutes / 60;
      if (end > now && !s.completed) {
        scheduledHoursByCourse.set(s.courseId, (scheduledHoursByCourse.get(s.courseId) || 0) + hours);
      }
      if (s.completed) {
        completedHoursByCourse.set(s.courseId, (completedHoursByCourse.get(s.courseId) || 0) + hours);
      }
    }
    return coursesIn.map(c => {
      const completedHours = completedHoursByCourse.get(c.id) || 0;
      const scheduledHours = scheduledHoursByCourse.get(c.id) || 0;
      const progress = Math.min(Math.round((completedHours / c.estimatedHours) * 100), 100);

      // Diagnostic logging for testcourse to analyze progress calculations
      if (c.name && c.name.toLowerCase() === 'testcourse') {
        try {
          const sessionsForCourse = sessionsIn.filter(ss => ss.courseId === c.id);
          const breakdown = sessionsForCourse.map(ss => {
            const end = new Date(`${ss.date}T${ss.endTime}`);
            const hours = ss.durationMinutes / 60;
            const contributesScheduled = end > now && !ss.completed;
            const contributesCompleted = !!ss.completed;
            const classification = contributesCompleted
              ? 'completed(+completedHours)'
              : (contributesScheduled ? 'future-incomplete(+scheduledHours)' : 'past-incomplete(ignored)');
            return {
              id: ss.id,
              date: ss.date,
              start: ss.startTime,
              end: ss.endTime,
              durationMinutes: ss.durationMinutes,
              hours,
              completed: !!ss.completed,
              endGtNow: end > now,
              classification
            };
          });
          // Grouped, concise output
          console.log('[ProgressDiag] testcourse breakdown', {
            courseId: c.id,
            estimatedHours: c.estimatedHours,
            totals: { completedHours, scheduledHours, progress },
            sessions: breakdown
          });
        } catch (e) {
          console.warn('[ProgressDiag] logging failed for testcourse', e);
        }
      }
      return { ...c, completedHours, scheduledHours, progress } as Course;
    });
  };

  // Removed duplicate study program state and unrelated currentUserId; handled above and via auth load

  const handleOnboardingComplete = async (program: StudyProgram) => {
    try {
      const updated = await apiUpdateStudyProgram({
        totalECTS: program.totalECTS,
        completedECTS: program.completedECTS,
        hoursPerECTS: program.hoursPerECTS,
      });
      setStudyProgram(updated);
      if (currentUserId) localStorage.setItem(`hasOnboarded:${currentUserId}`, 'true');
    } catch (e) {
      console.error('Failed updating study program', e);
    }
    setShowOnboarding(false);
    setShowPastSessionsReview(true);
  };

  // Legacy initial courses (used only for first-time migration to backend)
  const legacyInitialCourses: Course[] = [
    // SEMESTER 1 - Completed Courses
    {
      id: 'course-1-1',
      name: 'Introduction to Computer Science',
      type: 'project',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-01-15',
      milestones: [],
      createdAt: '2023-10-01',
      semester: 1,
    },
    {
      id: 'course-1-2',
      name: 'Introduction to Academic Work',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-01-20',
      milestones: [],
      createdAt: '2023-10-01',
      semester: 1,
    },
    {
      id: 'course-1-3',
      name: 'Mathematics I',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-02-10',
      milestones: [],
      createdAt: '2023-10-01',
      semester: 1,
    },
    {
      id: 'course-1-4',
      name: 'Object-Oriented Programming with Java',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-02-20',
      milestones: [],
      createdAt: '2023-10-01',
      semester: 1,
    },
    {
      id: 'course-1-5',
      name: 'Data Structures and Java Class Library',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-03-10',
      milestones: [],
      createdAt: '2023-10-01',
      semester: 1,
    },
    {
      id: 'course-1-6',
      name: 'Intercultural and Ethical Decision Making',
      type: 'project',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-03-20',
      milestones: [],
      createdAt: '2023-10-01',
      semester: 1,
    },

    // SEMESTER 2 - Completed Courses
    {
      id: 'course-2-1',
      name: 'Mathematics II',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-05-15',
      milestones: [],
      createdAt: '2024-04-01',
      semester: 2,
    },
    {
      id: 'course-2-2',
      name: 'Web Application Development',
      type: 'project',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-06-01',
      milestones: [],
      createdAt: '2024-04-01',
      semester: 2,
    },
    {
      id: 'course-2-3',
      name: 'Collaborative Work',
      type: 'project',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-06-20',
      milestones: [],
      createdAt: '2024-04-01',
      semester: 2,
    },
    {
      id: 'course-2-4',
      name: 'Statistics, Probability and Descriptive Statistics',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-07-10',
      milestones: [],
      createdAt: '2024-04-01',
      semester: 2,
    },
    {
      id: 'course-2-5',
      name: 'Computer Architecture and Operating Systems',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-07-25',
      milestones: [],
      createdAt: '2024-04-01',
      semester: 2,
    },
    
    // SEMESTER 2 - Open Courses
    {
      id: 'course-2-6',
      name: 'Project: Java and Web Development',
      type: 'project',
      ects: 5,
      progress: 40,
      estimatedHours: 137.5,
      completedHours: 55,
      scheduledHours: 27,
      status: 'active',
      estimatedEndDate: '2025-12-15',
      milestones: [
        { id: 'm1', title: 'Setup & Planning', deadline: '2025-10-30', completed: true },
        { id: 'm2', title: 'Backend Development', deadline: '2025-11-20', completed: false },
        { id: 'm3', title: 'Frontend & Testing', deadline: '2025-12-08', completed: false },
      ],
      createdAt: '2025-10-01',
      semester: 2,
    },

    // SEMESTER 3 - Completed Courses
    {
      id: 'course-3-1',
      name: 'Database Modeling and Database Systems',
      type: 'project',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-10-15',
      milestones: [],
      createdAt: '2024-09-01',
      semester: 3,
    },
    {
      id: 'course-3-3',
      name: 'Requirements Engineering',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-11-20',
      milestones: [],
      createdAt: '2024-09-01',
      semester: 3,
    },
    {
      id: 'course-3-4',
      name: 'Operating Systems, Computer Networks and Distributed Systems',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2024-12-10',
      milestones: [],
      createdAt: '2024-09-01',
      semester: 3,
    },

    // SEMESTER 3 - Open Courses
    {
      id: 'course-3-2',
      name: 'Project: Build a Data Mart in SQL',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-01-20',
      milestones: [],
      createdAt: '2025-10-15',
      semester: 3,
    },
    {
      id: 'course-3-5',
      name: 'Algorithms, Data Structures and Programming Languages',
      type: 'written-exam',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-02-10',
      milestones: [],
      createdAt: '2025-10-20',
      semester: 3,
    },
    {
      id: 'course-3-6',
      name: 'IT Service Management',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-03-10',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 3,
    },

    // SEMESTER 4 - Completed Courses
    {
      id: 'course-4-3',
      name: 'Introduction to Programming with Python',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2025-03-15',
      milestones: [],
      createdAt: '2025-01-01',
      semester: 4,
    },
    {
      id: 'course-4-5',
      name: 'Specification',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2025-04-20',
      milestones: [],
      createdAt: '2025-01-01',
      semester: 4,
    },

    // SEMESTER 4 - Open Courses
    {
      id: 'course-4-1',
      name: 'Project: IT Service Management',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-04-15',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 4,
    },
    {
      id: 'course-4-2',
      name: 'Theoretical Computer Science and Mathematical Logic',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-05-10',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 4,
    },
    {
      id: 'course-4-4',
      name: 'Software Quality Assurance',
      type: 'written-exam',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-06-10',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 4,
    },
    {
      id: 'course-4-6',
      name: 'Project: Software Engineering',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-07-10',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 4,
    },

    // SEMESTER 5 - Completed Courses
    {
      id: 'course-5-4',
      name: 'Electives A: Big Data Technologies',
      type: 'written-exam',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2025-06-15',
      milestones: [],
      createdAt: '2025-04-01',
      semester: 5,
    },

    // SEMESTER 5 - Open Courses
    {
      id: 'course-5-1',
      name: 'Seminar: Current Topics in Computer Science',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-08-15',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 5,
    },
    {
      id: 'course-5-2',
      name: 'Introduction to Data Protection and IT Security',
      type: 'written-exam',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-09-10',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 5,
    },
    {
      id: 'course-5-3',
      name: 'Cryptography',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-10-05',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 5,
    },
    {
      id: 'course-5-5',
      name: 'Electives A: Cloud Computing',
      type: 'written-exam',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-10-25',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 5,
    },
    {
      id: 'course-5-6',
      name: 'Electives B: Artificial Intelligence',
      type: 'written-exam',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-11-15',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 5,
    },
    {
      id: 'course-5-7',
      name: 'Electives B: AI Excellence with Creative Prompting Techniques',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2026-12-05',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 5,
    },

    // SEMESTER 6 - Completed Courses
    {
      id: 'course-6-1',
      name: 'Agile Project Management',
      type: 'project',
      ects: 5,
      progress: 100,
      estimatedHours: 137.5,
      completedHours: 137.5,
      scheduledHours: 0,
      status: 'completed',
      estimatedEndDate: '2025-08-20',
      milestones: [],
      createdAt: '2025-06-01',
      semester: 6,
    },

    // SEMESTER 6 - Open Courses
    {
      id: 'course-6-2',
      name: 'IT Law',
      type: 'project',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2027-01-15',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 6,
    },
    {
      id: 'course-6-3',
      name: 'Computer Science and Society',
      type: 'written-exam',
      ects: 5,
      progress: 0,
      estimatedHours: 137.5,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2027-02-10',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 6,
    },
    {
      id: 'course-6-4',
      name: 'Bachelor\'s Thesis',
      type: 'project',
      ects: 10,
      progress: 0,
      estimatedHours: 275,
      completedHours: 0,
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: '2027-03-31',
      milestones: [],
      createdAt: '2025-10-24',
      semester: 6,
    },
  ];

  // Course state (empty until loaded from backend or migrated)
  const [courses, setCourses] = useState<Course[]>([]);

  // Study blocks state
  const [studyBlocks, setStudyBlocks] = useState<StudyBlock[]>([
    {
      id: 'block-1',
      dayOfWeek: 1, // Monday
      startTime: '18:00',
      endTime: '21:00',
      durationMinutes: 180,
      isActive: true,
    },
    {
      id: 'block-2',
      dayOfWeek: 2, // Tuesday
      startTime: '18:00',
      endTime: '21:00',
      durationMinutes: 180,
      isActive: true,
    },
    {
      id: 'block-3',
      dayOfWeek: 3, // Wednesday
      startTime: '18:00',
      endTime: '20:00',
      durationMinutes: 120,
      isActive: true,
    },
    {
      id: 'block-4',
      dayOfWeek: 4, // Thursday
      startTime: '18:00',
      endTime: '21:00',
      durationMinutes: 180,
      isActive: true,
    },
  ]);


  // Legacy initial scheduled sessions (only for migration)
  const legacyInitialSessions: ScheduledSession[] = generateMockSessions();
  // Scheduled sessions state (loaded/migrated)
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>([]);

  // Authentication + migration handling
  const [authChecked, setAuthChecked] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const dominickEmail = (import.meta.env.VITE_ADMIN_EMAIL as string) || 'atzlerdo@gmail.com';
  
  // Track if we've already checked for past sessions on this login session
  const hasCheckedPastSessions = useRef(false);

  // Study program state (initialized with sane defaults to avoid null issues)
  const [studyProgram, setStudyProgram] = useState<StudyProgram>({
    totalECTS: 180,
    completedECTS: 0,
    hoursPerECTS: 27.5,
  });
  
  const recalcStudyProgramFromCourses = useCallback((coursesIn: Course[]) => {
    const totalEstimated = coursesIn.reduce((sum, c) => sum + (c.estimatedHours || 0), 0);
    const totalCompleted = coursesIn.reduce((sum, c) => sum + (c.completedHours || 0), 0);
    const completedECTS = coursesIn.reduce((sum, c) => sum + (c.status === 'completed' ? (c.ects || 0) : 0), 0);
    setStudyProgram(prev => {
      const updated: StudyProgram = {
        ...prev,
        completedECTS,
        // @ts-expect-error client-only aggregate fields
        aggregatedCompletedHours: totalCompleted,
        // @ts-expect-error client-only aggregate fields
        aggregatedEstimatedHours: totalEstimated,
      };
      if (isAuthenticated() && updated.completedECTS !== prev.completedECTS) {
        apiUpdateStudyProgram({ ...updated, aggregatedCompletedHours: undefined, aggregatedEstimatedHours: undefined } as unknown as StudyProgram).catch(() => {});
      }
      return updated;
    });
  }, []);

  // Recalculate study program aggregates from courses (single source, functional update)
  // Note: definition above uses functional setState to avoid dependency loops

  // Keep study program overview in sync when courses change
  useEffect(() => {
    if (!isAuthenticated()) return;
    if (courses && courses.length >= 0) {
      recalcStudyProgramFromCourses(courses);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  useEffect(() => {
    const run = async () => {
      if (!isAuthenticated()) {
        setAuthChecked(true);
        return;
      }
      // Just load data for existing sessions; avoid implicit auto-migration on unknown users
      setMigrating(true);
      try {
        const [courses, sessions, program] = await Promise.all([apiGetCourses(), apiGetSessions(), apiGetStudyProgram()]);
        
        // CRITICAL: Recalculate completedHours from actual session data to ensure DB matches UI
        // This ensures data integrity after page reload and prevents visual discrepancies
        console.log('🔍 Verifying course completedHours match attended sessions...');
        const recalculatedCourses = await recalculateCourseHoursFromSessions(
          courses as Course[], 
          sessions as ScheduledSession[]
        );
        
        // CRITICAL FIX (v0.6.7): Recalculate scheduledHours on app load
        // Backend might have stale scheduledHours values - recalculate from actual sessions
        console.log('🔍 Recalculating scheduledHours from session data...');
        const now = new Date();
        const scheduledHoursByCourse = new Map<string, number>();
        
        for (const session of sessions) {
          if (!session.courseId) continue;
          
          // Parse session end time to determine if it's in the future
          const sessionEndDateTime = new Date(`${session.date}T${session.endTime}`);
          if (sessionEndDateTime <= now) continue; // Skip past sessions
          
          const hours = session.durationMinutes / 60;
          const current = scheduledHoursByCourse.get(session.courseId) || 0;
          scheduledHoursByCourse.set(session.courseId, current + hours);
        }
        
        const coursesWithUpdatedScheduledHours = recalculatedCourses.map(course => {
          const oldScheduledHours = course.scheduledHours;
          const newScheduledHours = scheduledHoursByCourse.get(course.id) || 0;
          if (oldScheduledHours !== newScheduledHours) {
            console.log(`📊 Initial load - Course ${course.name}: scheduledHours ${oldScheduledHours}h → ${newScheduledHours}h`);
          }
          return {
            ...course,
            scheduledHours: newScheduledHours
          };
        });
        
        setCourses(coursesWithUpdatedScheduledHours);
        setScheduledSessions(sessions as ScheduledSession[]);

        // Ensure ECTS completion reflects completed courses when user starts mid-studies
        const completedECTSFromCourses = (courses as Course[])
          .filter(c => c.status === 'completed')
          .reduce((sum, c) => sum + (c.ects || 0), 0);

        const normalizedProgram: StudyProgram = {
          totalECTS: program.totalECTS ?? 180,
          hoursPerECTS: program.hoursPerECTS ?? 27.5,
          // Trust backend if it already tracks completedECTS; otherwise derive from courses
          completedECTS: (program.completedECTS && program.completedECTS > 0)
            ? program.completedECTS
            : completedECTSFromCourses,
        };

        setStudyProgram(normalizedProgram);

        // Persist normalization so reloads reflect accurate mid-study ECTS
        try {
          if ((program.completedECTS ?? 0) === 0 && completedECTSFromCourses > 0) {
            await apiUpdateStudyProgram({
              totalECTS: normalizedProgram.totalECTS,
              completedECTS: normalizedProgram.completedECTS,
              hoursPerECTS: normalizedProgram.hoursPerECTS,
            });
          }
        } catch (persistErr) {
          console.warn('Study program normalization persistence skipped:', persistErr);
        }
      } catch (e) {
        console.error('Initial load failed', e);
        // If API calls fail (e.g., database down or invalid token), clear auth and force re-login
        logout();
      } finally {
        setMigrating(false);
        setAuthChecked(true);
      }
    };
    run();
  }, []);

  // Dialog states
  const [showCourseDialog, setShowCourseDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [pendingSessionDraft, setPendingSessionDraft] = useState<{
    date: string; startTime: string; endTime: string; endDate?: string; recurring?: boolean; recurrencePattern?: RecurrencePattern | null;
  } | null>(null);
  const [pendingSelectCourseId, setPendingSelectCourseId] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | undefined>();
  const [editingBlock, setEditingBlock] = useState<StudyBlock | undefined>();
  const [editingSession, setEditingSession] = useState<ScheduledSession | undefined>();
  const [feedbackSession, setFeedbackSession] = useState<ScheduledSession | null>(null);
  const [originalSessionBeforeMove, setOriginalSessionBeforeMove] = useState<ScheduledSession | null>(null);
  const [previewSession, setPreviewSession] = useState<ScheduledSession | null>(null);

  // Check for past unevaluated sessions on startup (only once per login session)
  useEffect(() => {
    if (authChecked && !migrating && scheduledSessions.length > 0 && !showOnboarding && !hasCheckedPastSessions.current) {
      const pastSessions = getPastUnevaluatedSessions();
      if (pastSessions.length > 0) {
        setShowPastSessionsReview(true);
      }
      // Mark as checked so we don't show again until next login
      hasCheckedPastSessions.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, migrating, scheduledSessions.length, showOnboarding]);

  // Clear preview session when navigating away or closing dialog
  useEffect(() => {
    if (!showSessionDialog) {
      setPreviewSession(null);
    }
  }, [showSessionDialog]);

  // Calculate weekly capacity
  const weeklyCapacity = calculateWeeklyAvailableMinutes(studyBlocks);

  // Keep course progress bars in sync with calendar sessions.
  // Whenever the sessions list changes (create/edit/delete/import),
  // recompute each course's scheduled/completed hours and progress from sessions.
  useEffect(() => {
    if (!isAuthenticated()) return;
    if (courses.length > 0) {
      const recomputed = recalcCourseHours(courses as Course[], scheduledSessions as ScheduledSession[]);
      setCourses(recomputed as Course[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledSessions]);

  /**
   * Recalculate course completedHours from attended sessions in the database
   * This ensures the backend data matches what the user sees in the UI
   * CRITICAL: Called on page load to fix any inconsistencies from previous bugs
   */
  const recalculateCourseHoursFromSessions = async (
    courses: Course[],
    sessions: ScheduledSession[]
  ): Promise<Course[]> => {
    console.log('📊 Starting course hours recalculation from session data...');
    
    // Group sessions by course and calculate actual completed hours
    const actualCompletedHoursByCourse = new Map<string, number>();
    
    for (const session of sessions) {
      // Only count attended sessions assigned to a course
      if (session.completed && session.courseId) {
        const currentHours = actualCompletedHoursByCourse.get(session.courseId) || 0;
        const sessionHours = session.durationMinutes / 60;
        actualCompletedHoursByCourse.set(session.courseId, currentHours + sessionHours);
      }
    }
    
    // Check each course and update if backend value doesn't match actual
    const updatedCourses: Course[] = [];
    let correctionCount = 0;
    
    for (const course of courses) {
      const actualHours = actualCompletedHoursByCourse.get(course.id) || 0;
      const dbHours = course.completedHours;
      
      // Round to 2 decimal places for comparison to avoid floating point issues
      const actualRounded = Math.round(actualHours * 100) / 100;
      const dbRounded = Math.round(dbHours * 100) / 100;
      
      if (actualRounded !== dbRounded) {
        // Mismatch detected - update backend
        const newProgress = Math.min(Math.round((actualHours / course.estimatedHours) * 100), 100);
        
        console.warn(`⚠️ Course "${course.name}" completedHours mismatch:`, {
          database: dbHours,
          actualFromSessions: actualHours,
          difference: actualHours - dbHours,
          newProgress
        });
        
        try {
          // Update backend to match reality using extended API (supports completedHours/progress)
          await apiUpdateCourseExtended(course.id, {
            completedHours: actualHours,
            progress: newProgress,
          });
          
          // Update local course object
          updatedCourses.push({
            ...course,
            completedHours: actualHours,
            progress: newProgress,
          });
          
          correctionCount++;
          console.log(`✅ Corrected course "${course.name}" completedHours: ${dbHours} → ${actualHours}`);
        } catch (error) {
          console.error(`❌ Failed to update course ${course.id}:`, error);
          // Keep original course if update fails
          updatedCourses.push(course);
        }
      } else {
        // No correction needed
        updatedCourses.push(course);
      }
    }
    
    if (correctionCount > 0) {
      console.log(`✅ Corrected ${correctionCount} course(s) to match attended session hours`);
    } else {
      console.log('✅ All course completedHours match attended sessions - no corrections needed');
    }
    
    return updatedCourses;
  };

  // Get past sessions that need evaluation
  const getPastUnevaluatedSessions = (): ScheduledSession[] => {
    if (!scheduledSessions || scheduledSessions.length === 0) return [];
    const now = new Date();
    return scheduledSessions.filter((session) => {
      if (!session) return false;
      const { date, endTime, completed } = session;
      if (!date || !endTime) return false;
      // Expect YYYY-MM-DD; guard against malformed values
      const dateParts = date.split('-');
      if (dateParts.length !== 3) return false;
      const [year, month, day] = dateParts.map(Number);
      if (!year || !month || !day) return false;
      const timeParts = endTime.split(':');
      if (timeParts.length < 2) return false;
      const [endHour, endMinute] = timeParts.map(Number);
      const sessionEndDate = new Date(year, month - 1, day, endHour || 0, endMinute || 0, 0, 0);
      return sessionEndDate < now && !completed;
    });
  };

  // Session feedback handler
  const handleSessionFeedback = async (feedback: { 
    sessionId: string; 
    completed: boolean; 
    completedHours: number;
    selfAssessmentProgress: number;
    completedMilestones?: string[];
    newMilestones?: string[];
    selectedCourseId?: string;
  }) => {
    if (!feedbackSession) {
      console.warn('handleSessionFeedback called without an active feedbackSession');
      return;
    }

    // Build payload for update
    const payload: Record<string, unknown> = {
      completed: feedback.completed,
      completionPercentage: feedback.selfAssessmentProgress,
    };

    // If user selected a course for an unassigned session, include it
    if (feedback.selectedCourseId && !feedbackSession.courseId) {
      payload.courseId = feedback.selectedCourseId;
    }

    console.log('Updating session with payload:', feedbackSession.id, payload);

    try {
      // Persist the session update (cast needed for dynamic payload structure)
      await apiUpdateSession(feedbackSession.id, payload as Partial<typeof feedbackSession>);

      // Optimistic UI: immediately reflect completion state for the session
      setScheduledSessions(prev => prev.map(s => (
        s.id === feedbackSession.id ? { ...s, completed: !!feedback.completed } : s
      )));

      // Update course completedHours and progress on backend if applicable
      const targetCourseId = feedback.selectedCourseId || feedbackSession.courseId;
      if (targetCourseId && feedback.completed) {
        // Find the course to calculate new values
        const targetCourse = courses.find(c => c.id === targetCourseId);
        if (targetCourse) {
          // Only add hours if this action transitions the session to completed
          // This prevents duplicate hour counting and fixes retroactive past-session evaluation
          const wasAlreadyCompleted = feedbackSession.completed;
          const isNowCompleted = !!feedback.completed;
          const transitionedToCompleted = !wasAlreadyCompleted && isNowCompleted;
          const safeCompletedHours = Math.max(0, feedback.completedHours || 0);
          const hoursToAdd = transitionedToCompleted ? safeCompletedHours : 0;
          const newCompletedHours = targetCourse.completedHours + hoursToAdd;
          const newProgress = Math.min(Math.round((newCompletedHours / targetCourse.estimatedHours) * 100), 100);
          
          console.log(`📈 Updating course ${targetCourseId} completedHours on backend:`, {
            old: targetCourse.completedHours,
            added: hoursToAdd,
            new: newCompletedHours,
            progress: newProgress,
            wasAlreadyCompleted,
            transitionedToCompleted,
            idempotent: hoursToAdd === 0 ? '✅ No duplicate hours added' : '➕ Adding hours for first-time completion'
          });
          
          // Persist to backend using extended API (supports completedHours/progress)
          await apiUpdateCourseExtended(targetCourseId, {
            completedHours: newCompletedHours,
            progress: newProgress,
          });
        }
      }

      // Now refresh from backend to get authoritative data while preserving Google-moved sessions
      const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      
      // Recalculate course hours from fresh sessions to prevent stale values
      const now = new Date();
      const scheduledHoursByCourse = new Map<string, number>();
      const completedHoursByCourse = new Map<string, number>();
      
      for (const session of freshSessions) {
        if (!session.courseId) continue;
        
        // Parse session end time to determine if it's in the future
        const sessionEndDateTime = new Date(`${session.date}T${session.endTime}`);
        const hours = session.durationMinutes / 60;

        // Scheduled = future, incomplete
        if (sessionEndDateTime > now && !session.completed) {
          const current = scheduledHoursByCourse.get(session.courseId) || 0;
          scheduledHoursByCourse.set(session.courseId, current + hours);
        }

        // Completed = attended sessions only (whether past or future, but must be marked completed)
        if (session.completed) {
          const currentCompleted = completedHoursByCourse.get(session.courseId) || 0;
          completedHoursByCourse.set(session.courseId, currentCompleted + hours);
        }
      }
      
      const coursesWithUpdatedHours = freshCourses.map(course => {
        const newScheduledHours = scheduledHoursByCourse.get(course.id) || 0;
        const newCompletedHours = completedHoursByCourse.get(course.id) || 0;
        const newProgress = Math.min(Math.round((newCompletedHours / course.estimatedHours) * 100), 100);

        return {
          ...course,
          scheduledHours: newScheduledHours,
          completedHours: newCompletedHours,
          progress: newProgress,
        } as Course;
      });
      
      setCourses(coursesWithUpdatedHours as Course[]);
      setScheduledSessions(prev => mergeSessionsPreserveGoogle(prev, freshSessions as ScheduledSession[]));
      // Update study program overview immediately
      recalcStudyProgramFromCourses(coursesWithUpdatedHours as Course[]);

      // Handle milestones (these are not automatically persisted yet, so keep optimistic UI)
      if (targetCourseId && (feedback.newMilestones?.length || feedback.completedMilestones?.length)) {
        setCourses(prevCourses => {
          return prevCourses.map(course => {
            if (course.id !== targetCourseId) return course;
            let updatedMilestones = course.milestones || [];
            if (feedback.newMilestones && feedback.newMilestones.length > 0) {
              const newMilestoneObjects = feedback.newMilestones.map(title => ({
                id: `milestone-${Date.now()}-${Math.random()}`,
                title,
                deadline: '',
                completed: true,
              }));
              updatedMilestones = [...updatedMilestones, ...newMilestoneObjects];
            }
            if (feedback.completedMilestones && feedback.completedMilestones.length > 0) {
              updatedMilestones = updatedMilestones.map(m => 
                feedback.completedMilestones!.includes(m.id) ? { ...m, completed: true } : m
              );
            }
            return { ...course, milestones: updatedMilestones };
          });
        });
      }

      // Close dialogs only after successful persistence and refresh
      setShowFeedbackDialog(false);
      setFeedbackSession(null);
    } catch (e) {
      console.error('Failed to update session during feedback submission', e);
      // Keep dialog open so the user can retry; surface a simple alert for now
      alert('Fehler beim Speichern der Session-Bewertung. Bitte versuche es erneut.');
    }
  };

  // Course CRUD operations
  const handleAddCourse = () => {
    setEditingCourse(undefined);
    setShowCourseDialog(true);
  };

  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setShowCourseDialog(true);
  };

  const handleSaveCourse = async (courseData: Omit<Course, 'id' | 'progress' | 'completedHours' | 'createdAt'>) => {
    try {
      if (editingCourse) {
        // Recalculate estimated end date if estimated hours changed
        const estimatedEndDate = calculateEstimatedEndDate(
          courseData.estimatedHours - editingCourse.completedHours,
          weeklyCapacity
        );
        await apiUpdateCourse(editingCourse.id, {
          name: courseData.name,
          type: courseData.type,
          ects: courseData.ects,
          estimatedHours: courseData.estimatedHours,
          estimatedEndDate,
          examDate: courseData.examDate,
          semester: courseData.semester,
        });
      } else {
        const estimatedEndDate = calculateEstimatedEndDate(courseData.estimatedHours, weeklyCapacity);
        const created = await apiCreateCourse({
          name: courseData.name,
          type: courseData.type,
          ects: courseData.ects,
          estimatedHours: courseData.estimatedHours,
          estimatedEndDate,
          examDate: courseData.examDate,
          semester: courseData.semester,
        });
        // Prepare to return to SessionDialog with the newly created course selected
        if (pendingSessionDraft) {
          setPendingSelectCourseId(created.id);
        }
      }
      // Refresh from backend
      const [courses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(courses as Course[]);
      setScheduledSessions(sessions as ScheduledSession[]);
    } catch (e) {
      console.error('Course save failed', e);
    } finally {
      setEditingCourse(undefined);
      // If we came from a SessionDialog with a pending draft, reopen it with prior settings
      if (pendingSessionDraft) {
        setCreateSessionData({
          date: pendingSessionDraft.date,
          startTime: pendingSessionDraft.startTime,
          endTime: pendingSessionDraft.endTime,
        });
        setShowCourseDialog(false);
        setShowSessionDialog(true);
        // Keep pendingSelectCourseId to preselect the new course inside SessionDialog
        setPendingSessionDraft(null);
      }
    }
  };

  // In-app delete course dialog state
  const [showDeleteCourseDialog, setShowDeleteCourseDialog] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | undefined>(undefined);

  const requestDeleteCourse = (course: Course) => {
    setCourseToDelete(course);
    setShowDeleteCourseDialog(true);
  };

  const handleDeleteCourse = async (courseId: string) => {
    // Optimistic UI update: remove course locally immediately
    setCourses(prev => prev.filter(c => c.id !== courseId));
    setScheduledSessions(prev => prev.filter(s => s.courseId !== courseId));
    try {
      await apiDeleteCourse(courseId);
      const [courses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(courses as Course[]);
      setScheduledSessions(sessions as ScheduledSession[]);
      // Recompute study program overview
      recalcStudyProgramFromCourses(courses as Course[]);
    } catch (e) {
      console.error('Delete course failed', e);
      // If deletion failed, trigger a full refresh to reconcile state
      try {
        const [courses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
        setCourses(courses as Course[]);
        setScheduledSessions(sessions as ScheduledSession[]);
        recalcStudyProgramFromCourses(courses as Course[]);
      } catch (refreshErr) {
        console.warn('Fallback refresh after delete failed', refreshErr);
      }
    } finally {
      setShowDeleteCourseDialog(false);
      setCourseToDelete(undefined);
    }
  };

  const handleCompleteCourse = async (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    
    if (confirm(`Möchtest du den Kurs "${course.name}" wirklich abschließen? Die ECTS-Punkte werden deinem Studienfortschritt hinzugefügt.`)) {
      try {
        // Update course on backend
        // Will update extended fields via direct fetch below
        // await apiUpdateCourse(courseId, {});
        // Quick extended update via migration endpoint (status/progress/hours)
        // We reuse updateCourse since extended fields are allowed server-side
        const token = localStorage.getItem('authToken');
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/courses/${courseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ status: 'completed', progress: 100, completedHours: course.estimatedHours }),
        });
        // Refresh courses
        const latest = await apiGetCourses();
        setCourses(latest as Course[]);
      } catch (e) {
        console.error('Complete course failed', e);
      }
      // Add ECTS to study program (backend + local)
      setStudyProgram(prev => {
        const prevVal = prev || { totalECTS: 180, completedECTS: 0, hoursPerECTS: 27.5 };
        const newCompleted = prevVal.completedECTS + course.ects;
        apiUpdateStudyProgram({ completedECTS: newCompleted }).catch(err => console.error('Failed to update study program completion', err));
        return { ...prevVal, completedECTS: newCompleted };
      });
    }
  };

  

  const handleSaveBlock = (blockData: Omit<StudyBlock, 'id'>) => {
    if (editingBlock) {
      setStudyBlocks(prev => prev.map(b => 
        b.id === editingBlock.id ? { ...editingBlock, ...blockData } : b
      ));
    } else {
      const newBlock: StudyBlock = {
        id: `block-${Date.now()}`,
        ...blockData,
      };
      setStudyBlocks(prev => [...prev, newBlock]);
    }
    
    setEditingBlock(undefined);
  };


  // Session CRUD operations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAddSession = () => {
    setEditingSession(undefined);
    setShowSessionDialog(true);
  };

  const handleEditSession = (session: ScheduledSession) => {
    console.log('🖱️ Clicked session:', { 
      id: session.id, 
      courseId: session.courseId, 
      date: session.date, 
      time: `${session.startTime}-${session.endTime}`,
      completed: session.completed 
    });
    
    // Check if session has ended (comparing end time) in local timezone
    const [year, month, day] = session.date.split('-').map(Number);
    const [endHour, endMinute] = session.endTime.split(':').map(Number);
    const sessionEndDate = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
    const now = new Date();
    
    console.log('📅 Session time check:', { 
      sessionEndDate: sessionEndDate.toISOString(), 
      now: now.toISOString(), 
      isPast: sessionEndDate < now 
    });
    
    const needsEval = sessionEndDate < now && (!session.completed || !session.completionPercentage || session.completionPercentage === 0);
    if (needsEval) {
      // Past session - first ask if attended
      console.log('👉 Opening attendance dialog (past session)');
      setFeedbackSession(session);
      setShowAttendanceDialog(true);
    } else {
      // Future or completed session - show edit dialog
      console.log('👉 Opening edit dialog (future/completed session)');
      setCreateSessionData(null); // Clear create session data to avoid showing both dialogs
      setEditingSession(session);
      setShowSessionDialog(true);
    }
  };

  const handleSessionAttended = () => {
    // User attended the session - show feedback dialog
    setShowAttendanceDialog(false);
    setShowFeedbackDialog(true);
  };

  // Helper: parse local datetime
  const parseLocalDateTime = (dateStr: string, timeStr: string) => new Date(`${dateStr}T${timeStr}`);

  // Find unassigned study sessions in the future (sorted soonest-first)
  const findUnassignedSessionsAfter = (after: Date): ScheduledSession[] => {
    return scheduledSessions
      .filter((s) => !s.courseId && !s.completed && parseLocalDateTime(s.date, s.startTime).getTime() > after.getTime())
      .sort((a, b) => parseLocalDateTime(a.date, a.startTime).getTime() - parseLocalDateTime(b.date, b.startTime).getTime());
  };

  // Gather unassigned sessions until the required minutes are covered (allow over-planning)
  const collectReplanSlots = (after: Date, requiredMinutes: number) => {
    const candidates = findUnassignedSessionsAfter(after);
    const selected: ScheduledSession[] = [];
    let totalMinutes = 0;

    for (const slot of candidates) {
      selected.push(slot);
      totalMinutes += slot.durationMinutes;
      if (totalMinutes >= requiredMinutes) {
        break;
      }
    }

    return { selected, totalMinutes };
  };

  // Apply: user did not attend and does NOT want automatic replanning
  const applyNotAttendedWithoutReplan = async (session: ScheduledSession) => {
    const course = courses.find((c) => c.id === session.courseId);
    if (!course) return;

    try {
      // Mark missed session completed with 0% in backend
      await apiUpdateSession(session.id, {
        courseId: session.courseId,
        studyBlockId: session.studyBlockId,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMinutes: session.durationMinutes,
        completed: true,
        completionPercentage: 0,
        notes: session.notes,
        endDate: session.endDate,
      });

      // Decrease scheduled hours previously allocated
      const sessionHours = session.durationMinutes / 60;
      await apiUpdateCourseExtended(course.id, {
        scheduledHours: Math.max(0, course.scheduledHours - sessionHours),
      });

      // Refresh data from backend and merge to preserve Google-moved sessions
      const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(freshCourses as Course[]);
      setScheduledSessions(prev => mergeSessionsPreserveGoogle(prev, freshSessions as ScheduledSession[]));
    } catch (error) {
      // Handle 404 as benign (session already deleted/processed)
      if (error instanceof Error && error.message.includes('Session not found')) {
        console.warn('⚠️ Session already processed or deleted:', session.id);
        // Refresh data to sync with backend state
        try {
          const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
          setCourses(freshCourses as Course[]);
          setScheduledSessions(freshSessions as ScheduledSession[]);
        } catch (refreshError) {
          console.error('Failed to refresh after 404:', refreshError);
        }
      } else {
        console.error('Failed to mark session as not attended:', error);
      }
    }
  };

  // Apply: user did not attend and WANTS automatic replanning into unassigned sessions
  const applyNotAttendedWithReplan = async (session: ScheduledSession, targets: ScheduledSession[]) => {
    const course = courses.find((c) => c.id === session.courseId);
    if (!course) return;
    if (!targets.length) {
      await applyNotAttendedWithoutReplan(session);
      return;
    }

    const missedHours = session.durationMinutes / 60;
    const targetHours = targets.reduce((sum, t) => sum + t.durationMinutes / 60, 0);

    try {
      console.log('dY"? Replan start:', {
        missedSessionId: session.id,
        targetSessionIds: targets.map(t => t.id),
        courseId: session.courseId,
        missedDuration: session.durationMinutes,
        targetDuration: targetHours * 60,
      });

      // 1) Delete missed session (treat 404 as success)
      try {
        await apiDeleteSession(session.id);
        console.log('?o. Deleted missed session in backend:', session.id);
      } catch (delErr: unknown) {
        const msg = (delErr as { message?: string })?.message || '';
        if (msg.includes('Session not found')) {
          console.warn('?s??,? Missed session already absent (404), proceeding:', session.id);
          setScheduledSessions(prev => prev.filter(s => s.id !== session.id));
        } else {
          console.error('??O Failed deleting missed session, aborting replan:', delErr);
          return;
        }
      }

      // 2) Assign target sessions to course
      for (const target of targets) {
        try {
          await apiUpdateSession(target.id, {
            courseId: session.courseId, // Assign course
            studyBlockId: target.studyBlockId,
            date: target.date,
            startTime: target.startTime,
            endTime: target.endTime,
            durationMinutes: target.durationMinutes,
            notes: target.notes,
            endDate: target.endDate,
            googleEventId: target.googleEventId,
            googleCalendarId: target.googleCalendarId,
          });
          console.log('?o. Target session updated & assigned:', target.id);
        } catch (updErr) {
          console.error('??O Failed updating target session during replan:', updErr);
          // Attempt local optimistic assignment so user sees change
          setScheduledSessions(prev => prev.map(s => s.id === target.id ? { ...s, courseId: session.courseId } : s));
        }
      }

      // 3) Refresh authoritative data (let backend recalc scheduledHours)
      try {
        const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
        setCourses(freshCourses as Course[]);

        // Merge backend snapshot with latest in-memory state to avoid clobbering Google-moved sessions.
        setScheduledSessions(prevSessions => mergeSessionsPreserveGoogle(
          prevSessions,
          freshSessions as ScheduledSession[],
          new Set(targets.map(t => t.id)) // protect replan targets from being reverted
        ));
        console.log('Replan backend refresh complete');
      } catch (refreshErr) {
        console.error('Replan refresh failed; applying local fallback', refreshErr);
        // Local fallback: remove missed session, assign target courseId, adjust scheduledHours
        setScheduledSessions(prev => prev
          .filter(s => s.id !== session.id)
          .map(s => targets.some(t => t.id === s.id) ? { ...s, courseId: session.courseId } : s)
        );
        setCourses(prev => prev.map(c => {
          if (c.id !== course.id) return c;
          // If durations differ adjust scheduledHours (keep non-negative)
          const newScheduled = Math.max(0, c.scheduledHours - missedHours + targetHours);
          const newStatus = c.status === 'planned' ? 'active' : c.status;
          return { ...c, scheduledHours: newScheduled, status: newStatus };
        }));
      }

      console.log('?o. Replan complete');
    } catch (error) {
      console.error('Unexpected replan wrapper failure:', error);
    }
  };

  const handleSessionNotAttended = () => {
    if (!feedbackSession) return;

    const now = new Date();
    const requiredMinutes = feedbackSession.durationMinutes;
    const { selected, totalMinutes } = collectReplanSlots(now, requiredMinutes);

    setMissedSession(feedbackSession);
    setReplanCandidates(selected);
    setReplanTotalMinutes(totalMinutes);
    setReplanHandled(false);
    
    setShowAttendanceDialog(false);
    setFeedbackSession(null);
    
    setTimeout(() => {
      setShowReplanDialog(true);
    }, 300);
  };

  /**
   * ============================================================================
   * SESSION CRUD - Create/Update session
   * ============================================================================
   * 
   * Handles both new session creation and editing existing sessions.
   * 
   * Process:
   * 1. Save to backend via API (create or update)
   * 2. Refresh courses and sessions from backend
   * 3. Auto-activate course if status is 'planned'
   * 4. Clear edit state and close dialog
   * 5. Trigger Google Calendar sync
   * 
   * Course Lifecycle:
   * - planned: Course has no scheduled sessions yet
   * - active: First session scheduled (auto-transition happens here)
   * - completed: User manually marks course as finished
   * 
   * @param sessionData Session fields (without ID for new sessions)
   */
  const handleSaveSession = async (sessionData: Omit<ScheduledSession, 'id'>) => {
    console.log('💾 Saving Session:', {
      isEditing: !!editingSession,
      editingSessionId: editingSession?.id,
      editingGoogleEventId: editingSession?.googleEventId,
      sessionData: {
        date: sessionData.date,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        course: sessionData.courseId,
        duration: sessionData.durationMinutes,
        // googleEventId may exist on the full session but not in the Omit<> type
        googleEventId: (sessionData as ScheduledSession).googleEventId
      },
      currentTime: new Date().toString()
    });
    
    // CourseId handling rules:
    //  - CREATE: omit field entirely if unassigned (backend treats missing as NULL)
    //  - UPDATE (unassign): must send explicit null to clear existing association
    //  - UPDATE (assign/change): send the trimmed courseId string
    const hasIncomingCourse = !!(sessionData.courseId && sessionData.courseId.trim() !== '');
    const isUnassigning = !!(editingSession && editingSession.courseId && !hasIncomingCourse);
    const courseIdForPayload = hasIncomingCourse
      ? sessionData.courseId!.trim()
      : (isUnassigning ? null : undefined); // null only when clearing during update

    try {
      // Update existing session or create new one
      if (editingSession) {
        console.log('🔄 UPDATING existing session:', editingSession.id);
        await apiUpdateSession(editingSession.id, {
          // For updates we include courseId only when assigning or clearing; otherwise omit
          // Type assertion needed because API accepts null but TypeScript expects string|undefined
          ...(courseIdForPayload !== undefined ? { courseId: courseIdForPayload as string | undefined } : {}),
          studyBlockId: sessionData.studyBlockId,
          date: sessionData.date,
          startTime: sessionData.startTime,
          endDate: sessionData.endDate,
          endTime: sessionData.endTime,
          durationMinutes: sessionData.durationMinutes,
          notes: sessionData.notes,
          // Forward recurrence pattern if session is recurring
          ...(sessionData.recurrence ? { recurrence: sessionData.recurrence } : {}),
          // Preserve Google Calendar sync field during updates to prevent clearing it
          // This prevents the "flash" bug where sessions jump to old positions before sync completes
          // Without this, the googleEventId gets cleared from DB, causing merge logic to choose
          // the remote version with old dates, creating a visual flash until sync completes
          googleEventId: editingSession.googleEventId,
        });
      } else {
        console.log('✨ CREATING new session with data:', {
          courseId: courseIdForPayload,
          date: sessionData.date,
          startTime: sessionData.startTime,
          endTime: sessionData.endTime,
          hasRecurrence: !!sessionData.recurrence
        });
        const createdSession = await apiCreateSession({
          // For creation omit courseId when unassigned so backend validation (string) doesn't reject null
          ...(courseIdForPayload !== undefined && courseIdForPayload !== null ? { courseId: courseIdForPayload } : {}),
          studyBlockId: sessionData.studyBlockId,
          date: sessionData.date,
          startTime: sessionData.startTime,
          endDate: sessionData.endDate,
          endTime: sessionData.endTime,
          durationMinutes: sessionData.durationMinutes,
          notes: sessionData.notes,
          // Create recurrence pattern in backend if provided
          ...(sessionData.recurrence ? { recurrence: sessionData.recurrence } : {}),
        });
        console.log('✅ Backend created session:', {
          sessionId: createdSession.id,
          courseId: createdSession.courseId,
          date: createdSession.date,
          startTime: createdSession.startTime
        });
        // TODO: Implement proper server-side recurring session generation
        // Currently only creates single session with recurrence metadata
      }
      
      // Refresh data from backend to ensure consistency
      console.log('📡 BACKEND FETCH: Requesting fresh sessions from API...');
      const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      console.log('📥 BACKEND RESPONSE:', {
        totalSessions: freshSessions.length,
        samplesWithGoogleEventId: freshSessions.filter(s => s.googleEventId).slice(0, 3).map(s => ({
          id: s.id.substring(0, 20),
          googleEventId: s.googleEventId?.substring(0, 20) + '...'
        })),
        samplesWithoutGoogleEventId: freshSessions.filter(s => !s.googleEventId).slice(0, 3).map(s => ({
          id: s.id.substring(0, 20),
          date: s.date
        })),
        totalWithGoogleEventId: freshSessions.filter(s => s.googleEventId).length,
        totalWithoutGoogleEventId: freshSessions.filter(s => !s.googleEventId).length
      });
      
      // Recalculate scheduled/completed hours and progress for all courses
      const coursesWithUpdatedHours = recalcCourseHours(freshCourses as Course[], freshSessions as ScheduledSession[]);
      
      console.log('💾 SETTING STATE: About to update React state with fresh sessions');
      console.log('🔍 STATE UPDATE VERIFICATION:', {
        totalSessions: freshSessions.length,
        withGoogleEventId: freshSessions.filter(s => s.googleEventId).length,
        withoutGoogleEventId: freshSessions.filter(s => !s.googleEventId).length,
        sampleWithId: freshSessions.find(s => s.googleEventId) ? {
          id: freshSessions.find(s => s.googleEventId)!.id.substring(0, 20),
          googleEventId: freshSessions.find(s => s.googleEventId)!.googleEventId?.substring(0, 20)
        } : 'NONE',
        sessionsWithCourses: freshSessions.filter(s => s.courseId).length,
        sessionsWithoutCourses: freshSessions.filter(s => !s.courseId).length,
        allSessionsOverview: freshSessions.map(s => ({
          id: s.id.substring(0, 8),
          courseId: s.courseId ? s.courseId.substring(0, 8) + '...' : 'NONE',
          courseIdFull: s.courseId || 'NONE',
          date: s.date,
          time: `${s.startTime}-${s.endTime}`
        }))
      });
      setCourses(coursesWithUpdatedHours as Course[]);
      setScheduledSessions(freshSessions as ScheduledSession[]);
      
      // Auto-activate course ONLY if there is a PAST session (end time < now) assigned to it
      if (sessionData.courseId) {
        const course = coursesWithUpdatedHours.find(c => c.id === sessionData.courseId);
        if (course && course.status === 'planned') {
          const hasPastSession = freshSessions.some(s => {
            if (s.courseId !== course.id) return false;
            const sessionEndDateTime = new Date(`${s.date}T${s.endTime}`);
            return sessionEndDateTime <= now;
          });
          if (hasPastSession) {
            const token = localStorage.getItem('authToken');
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/courses/${course.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ status: 'active' }),
            });
            const againCourses = await apiGetCourses();
            const againWithHours = againCourses.map(c => ({
              ...c,
              scheduledHours: scheduledHoursByCourse.get(c.id) || 0
            }));
            setCourses(againWithHours as Course[]);
          }
        }
      }
    } catch (e) {
      console.error('Save session failed', e);
    }
    
    // Clean up state and close dialog
    setOriginalSessionBeforeMove(null);
    setEditingSession(undefined);
    setShowSessionDialog(false);
    
    // Trigger Google Calendar auto-sync
    setAutoSyncTrigger(Date.now());
  };
  const handleDeleteSession = async (sessionId: string) => {
    const sessionToDelete = scheduledSessions.find(s => s.id === sessionId);
    console.log(`🗑️ App: Deleting session ${sessionId}`, {
      googleEventId: sessionToDelete?.googleEventId,
      date: sessionToDelete?.date,
      startTime: sessionToDelete?.startTime,
      courseId: sessionToDelete?.courseId,
      hasGoogleEventId: !!sessionToDelete?.googleEventId
    });
    
    // Mark as recently deleted to prevent re-import during sync grace period
    try {
      const recentlyDeleted: Record<string, number> = {};
      const stored = localStorage.getItem('googleCalendarRecentlyDeleted');
      if (stored) {
        Object.assign(recentlyDeleted, JSON.parse(stored));
      }
      recentlyDeleted[sessionId] = Date.now();
      localStorage.setItem('googleCalendarRecentlyDeleted', JSON.stringify(recentlyDeleted));
      console.log('  📝 Marked session as recently deleted (grace period for sync)');
      console.log('  📋 Currently tracked deleted sessions:', Object.keys(recentlyDeleted).join(', '));
    } catch (e) {
      console.warn('  ⚠️ Failed to mark as recently deleted:', e);
    }
    
    try {
      await apiDeleteSession(sessionId);
      const [freshCourses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      
      // Check if any courses now have zero sessions and should be deactivated
      const courseSessionCounts = new Map<string, number>();
      for (const session of sessions) {
        if (session.courseId) {
          courseSessionCounts.set(session.courseId, (courseSessionCounts.get(session.courseId) || 0) + 1);
        }
      }
      
      // Deactivate courses with no sessions
      for (const course of freshCourses) {
        if (course.status === 'active' && !courseSessionCounts.has(course.id)) {
          try {
            // Use extended API which supports status field
            await apiUpdateCourseExtended(course.id, { status: 'planned' });
            console.log(`  📦 Deactivated course ${course.name} - no sessions remaining`);
          } catch (error) {
            console.error(`  ❌ Failed to deactivate course ${course.id}:`, error);
          }
        }
      }
      
      // Refresh again to get updated statuses
      const [finalCourses, finalSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      // Recalculate hours and progress after deletion
      const recalculatedAfterDelete = recalcCourseHours(finalCourses as Course[], finalSessions as ScheduledSession[]);
      setCourses(recalculatedAfterDelete as Course[]);
      setScheduledSessions(finalSessions as ScheduledSession[]);
      console.log('  ✅ Courses and sessions refreshed from backend');
    } catch (e: unknown) {
      // Type guard for error object with message property
      const msg = (e as { message?: string })?.message || '';
      if (msg.includes('Session not found')) {
        console.warn('  ⚠️ Backend reports session already missing (404). Removing locally:', sessionId);
        setScheduledSessions(prev => prev.filter(s => s.id !== sessionId));
        try {
          const [freshCourses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
          
          // Check if any courses now have zero sessions and should be deactivated
          const courseSessionCounts = new Map<string, number>();
          for (const session of sessions) {
            if (session.courseId) {
              courseSessionCounts.set(session.courseId, (courseSessionCounts.get(session.courseId) || 0) + 1);
            }
          }
          
          // Deactivate courses with no sessions
          for (const course of freshCourses) {
            if (course.status === 'active' && !courseSessionCounts.has(course.id)) {
              try {
                // Use extended API which supports status field
                await apiUpdateCourseExtended(course.id, { status: 'planned' });
                console.log(`  📦 Deactivated course ${course.name} - no sessions remaining`);
              } catch (error) {
                console.error(`  ❌ Failed to deactivate course ${course.id}:`, error);
              }
            }
          }
          
          const [finalCourses, finalSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
          setCourses(finalCourses as Course[]);
          setScheduledSessions(finalSessions as ScheduledSession[]);
          console.log('  🔄 Post-404 refresh complete');
        } catch (refreshErr) {
          console.error('  ❌ Post-404 refresh failed', refreshErr);
        }
      } else {
        console.error('Delete session failed', e);
      }
    }
    // Clear state and close dialog
    setOriginalSessionBeforeMove(null);
    setEditingSession(undefined);
    setShowSessionDialog(false);
    // Trigger auto-sync
    setAutoSyncTrigger(Date.now());
  };

  // (removed debug instrumentation)

  // Bulk delete all sessions (user wants to reset calendar)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteAllSessions = async () => {
    try {
      console.log('🗑️ App: Bulk deleting ALL sessions');
      const existing = await apiGetSessions();
      for (const s of existing) {
        console.log('   → Deleting', s.id, s.courseId || '(unassigned)');
        try {
          await apiDeleteSession(s.id);
        } catch (e: unknown) {
          // Type guard for error object with message property
          const msg = (e as { message?: string })?.message || '';
          if (msg.includes('Session not found')) {
            console.warn('     ⚠️ Already gone (404), ensuring local removal for:', s.id);
            setScheduledSessions(prev => prev.filter(sess => sess.id !== s.id));
          } else {
            console.error('     ❌ Delete failed:', s.id, e);
          }
        }
      }
      const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(freshCourses as Course[]);
      setScheduledSessions(freshSessions as ScheduledSession[]);
      console.log(`  ✅ Bulk delete complete (${existing.length} attempted)`);
    } catch (e: unknown) {
      console.error('Bulk delete sessions failed', e);
    }
    setEditingSession(undefined);
    setOriginalSessionBeforeMove(null);
    setShowSessionDialog(false);
    setAutoSyncTrigger(Date.now());
  };

  // Handle sessions imported from Google Calendar
  const lastImportRef = useRef<{ time: number; sessionIds: Set<string> }>({ 
    time: 0, 
    sessionIds: new Set() 
  });

  const handleSessionsImported = (importedSessions: ScheduledSession[], syncStartTime?: number) => {
    const now = Date.now();
    
    // CRITICAL: Prevent duplicate imports within short time window (React StrictMode protection)
    // If the same sessions were imported within the last 2 seconds, skip to avoid duplicates
    const timeSinceLastImport = now - lastImportRef.current.time;
    const importedIds = new Set(importedSessions.map(s => s.id));
    
    if (timeSinceLastImport < 2000) {
      // Check if it's the same set of sessions (ignore order)
      const isSameImport = importedIds.size === lastImportRef.current.sessionIds.size &&
        Array.from(importedIds).every(id => lastImportRef.current.sessionIds.has(id));
      
      if (isSameImport) {
        console.log('⏸️ Duplicate import detected (same sessions within 2s), skipping to prevent duplicates');
        return;
      }
    }
    
    // Update last import tracking
    lastImportRef.current = { time: now, sessionIds: importedIds };
    
    console.log('📥 App: Importing sessions from Google Calendar:', importedSessions.length);
    
    // Stamp imported sessions so they are considered fresher than any older backend snapshot
    const stampedImported = importedSessions.map(s => ({
      ...s,
      lastModified: now,
    }));
    
    // Track if any changes were made during sync (need to re-sync)
    let hasChangesDuringSync = false;
    
    // To prevent race conditions where sessions are added during sync:
    // 1. Get current app state (which may include new sessions added during sync)
    // 2. Merge synced sessions with any new local sessions not yet synced
  setScheduledSessions(currentSessions => {
      console.log('🔁 App: Merging synced sessions with current app state');
      console.log('  Current sessions in app:', currentSessions.length);
      console.log('  Current session IDs:', currentSessions.map(s => `${s.id} (date:${s.date}, googleEventId:${s.googleEventId || 'none'})`).join(' | '));
      console.log('  Current recurring masters:', currentSessions.filter(s => s.recurrence).map(s => ({ id: s.id, rrule: s.recurrence?.rrule })));
      console.log('  Current expanded instances:', currentSessions.filter(s => s.recurringEventId && !s.recurrence).map(s => ({ id: s.id, masterId: s.recurringEventId })));
      console.log('  Synced sessions from Google:', stampedImported.length);
      console.log('  Synced session IDs:', stampedImported.map(s => `${s.id} (date:${s.date}, googleEventId:${s.googleEventId || 'none'})`).join(' | '));
      console.log('  Synced recurring masters:', stampedImported.filter(s => s.recurrence).map(s => ({ id: s.id, rrule: s.recurrence?.rrule })));
      
      // Build maps for efficient lookup
      const syncedById = new Map(stampedImported.map(s => [s.id, s]));
      const currentById = new Map(currentSessions.map(s => [s.id, s]));
      
      console.log('🔍 MERGE ANALYSIS:');
      const onlyInApp = Array.from(currentById.keys()).filter(id => !syncedById.has(id));
      const onlyInGoogle = Array.from(syncedById.keys()).filter(id => !currentById.has(id));
      const inBoth = Array.from(currentById.keys()).filter(id => syncedById.has(id));
      
      console.log('  - Sessions ONLY in app (not synced):', onlyInApp.map(id => {
        const s = currentById.get(id)!;
        return `${id} (date:${s.date}, googleEventId:${s.googleEventId || 'none'})`;
      }));
      console.log('  - Sessions ONLY in Google (not in app):', onlyInGoogle.map(id => {
        const s = syncedById.get(id)!;
        return `${id} (date:${s.date}, googleEventId:${s.googleEventId || 'none'})`;
      }));
      console.log('  - Sessions in BOTH:', inBoth.map(id => {
        const curr = currentById.get(id)!;
        const sync = syncedById.get(id)!;
        return `${id} (curr.googleEventId:${curr.googleEventId || 'none'}, sync.googleEventId:${sync.googleEventId || 'none'})`;
      }));
      
      // CRITICAL: Merge local and synced sessions with conflict resolution
      // Strategy: Synced sessions are authoritative - they represent the merged state
      // Only preserve local sessions that were created/modified DURING the sync
      const sessionById = new Map<string, ScheduledSession>();
      
      // First, add all synced sessions (authoritative - this is the merged state from server)
      for (const syncedSession of stampedImported) {
        sessionById.set(syncedSession.id, syncedSession);
      }
      
      // Then, check current sessions for any that were created/modified DURING the sync
      // These need to be preserved and will trigger a re-sync
      for (const [id, currentSession] of currentById) {
        const syncedSession = syncedById.get(id);
        
        // Skip expanded instances - they're generated from recurring masters
        if (currentSession.recurringEventId && !currentSession.recurrence) {
          console.log(`⏭️ Skipping expanded instance ${id} (generated from recurring master ${currentSession.recurringEventId})`);
          continue;
        }
        
        if (syncedSession) {
          // Session exists in both - check if local was modified during sync
          const currentMod = currentSession.lastModified || 0;
          const syncedMod = syncedSession.lastModified || 0;
          
          if (syncStartTime && currentMod > syncStartTime) {
            // Local session was modified DURING the sync - prefer local (user's latest change)
            console.log(`🔄 Conflict: Session ${id} modified during sync - preserving local changes`, {
              local: { mod: new Date(currentMod).toISOString(), googleEventId: currentSession.googleEventId },
              synced: { mod: new Date(syncedMod).toISOString(), googleEventId: syncedSession.googleEventId }
            });
            sessionById.set(id, currentSession);
            hasChangesDuringSync = true; // Mark for re-sync
          } else {
            // CRITICAL FIX: Use synced/backend version which has authoritative attendance data
            // The backend is the source of truth for completed/completionPercentage
            // These fields ARE persisted to database and should be fetched from backend
            console.log(`✅ Using synced/backend version of ${id} (attendance data from database)`, {
              synced: { mod: new Date(syncedMod).toISOString(), googleEventId: syncedSession.googleEventId, completed: syncedSession.completed, completionPercentage: syncedSession.completionPercentage, courseId: syncedSession.courseId },
              local: { mod: new Date(currentMod).toISOString(), googleEventId: currentSession.googleEventId, completed: currentSession.completed, completionPercentage: currentSession.completionPercentage, courseId: currentSession.courseId }
            });
            sessionById.set(id, syncedSession); // Use backend data as-is
          }
        } else {
          // Session only in current state (not in sync result)
          const currentMod = currentSession.lastModified || 0;
          if (syncStartTime && currentMod > syncStartTime) {
            // Created during sync - add it and trigger re-sync
            console.log(`➕ Preserving local session ${id} created during sync`, {
              mod: new Date(currentMod).toISOString(),
              googleEventId: currentSession.googleEventId,
              date: currentSession.date,
              courseId: currentSession.courseId
            });
            sessionById.set(id, currentSession);
            hasChangesDuringSync = true; // Mark for re-sync
          } else if (currentSession.googleEventId) {
            // Has googleEventId but not in sync result - was deleted from Google Calendar
            // Do NOT add to sessionById - this removes it from app state
            console.log(`🗑️ Removing local session ${id} - was synced to Google (has googleEventId) but deleted from calendar`, {
              googleEventId: currentSession.googleEventId,
              date: currentSession.date,
              startTime: currentSession.startTime,
              courseId: currentSession.courseId
            });
          } else {
            // Local-only session (no googleEventId) - keep it for future sync
            console.log(`📍 Preserving local-only session ${id} (never synced to Google)`, {
              date: currentSession.date,
              startTime: currentSession.startTime,
              courseId: currentSession.courseId
            });
            sessionById.set(id, currentSession);
          }
        }
      }
      
      const finalSessions = Array.from(sessionById.values());
      
      console.log('┌─────────────────────────────────────────────────────────┐');
      console.log('│ FINAL APP STATE AFTER MERGE                             │');
      console.log('├─────────────────────────────────────────────────────────┤');
      console.log('│ Total sessions:', finalSessions.length);
      console.log('│ Recurring masters:', finalSessions.filter(s => s.recurrence).map(s => ({ id: s.id, rrule: s.recurrence?.rrule })));
      console.log('│ Expanded instances (should be 0):', finalSessions.filter(s => s.recurringEventId && !s.recurrence).length);
      console.log('│ Sessions WITH googleEventId:', finalSessions.filter(s => s.googleEventId).map(s => `${s.id}:${s.googleEventId?.substring(0, 8)}...`).join(', '));
      console.log('│ Sessions WITHOUT googleEventId:', finalSessions.filter(s => !s.googleEventId).map(s => `${s.id} (date:${s.date})`).join(', '));
      console.log('└─────────────────────────────────────────────────────────┘');
      
      // Recalculate scheduledHours for all courses based on merged sessions
      // scheduledHours = only FUTURE sessions (date >= today) assigned to course
      console.log('🔄 Recalculating scheduled hours for all courses...');
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const scheduledHoursByCourse = new Map<string, number>();
      
      for (const session of finalSessions) {
        // Skip unassigned sessions (blockers) - they don't count toward course hours
        if (!session.courseId) continue;
        
        // Only count FUTURE sessions (date >= today) for scheduledHours
        // Past sessions should only affect completedHours (if attended)
        if (session.date < today) continue;
        
        const hours = session.durationMinutes / 60;
        const current = scheduledHoursByCourse.get(session.courseId) || 0;
        scheduledHoursByCourse.set(session.courseId, current + hours);
      }
      
      // Update courses with recalculated scheduled hours
      setCourses(prevCourses => prevCourses.map(course => ({
        ...course,
        scheduledHours: scheduledHoursByCourse.get(course.id) || 0
      })));
      
      return finalSessions;
    });
    
    // CRITICAL FIX: Save updated sessions (with googleEventId) back to database
    // This ensures googleEventId persists across restarts
    console.log('💾 Saving merged sessions back to database to persist googleEventIds...');
    const sessionsWithGoogleEventId = stampedImported.filter(s => s.googleEventId);
    if (sessionsWithGoogleEventId.length > 0) {
      console.log(`  Updating ${sessionsWithGoogleEventId.length} sessions with googleEventId in database...`);
      Promise.all(
        sessionsWithGoogleEventId.map(async (session) => {
          try {
            await apiUpdateSession(session.id, {
              courseId: session.courseId,
              studyBlockId: session.studyBlockId || '',
              date: session.date,
              startTime: session.startTime,
              endDate: session.endDate,
              endTime: session.endTime,
              durationMinutes: session.durationMinutes,
              completed: session.completed,
              completionPercentage: session.completionPercentage,
              notes: session.notes,
              googleEventId: session.googleEventId, // CRITICAL: Save to database
              googleCalendarId: session.googleCalendarId,
            });
            console.log(`    ✅ Saved ${session.id} with googleEventId: ${session.googleEventId?.substring(0, 20)}...`);
          } catch (error) {
            console.error(`    ❌ Failed to save ${session.id}:`, error);
          }
        })
      ).then(() => {
        console.log('✅ All merged sessions saved to database');
      }).catch((error) => {
        console.error('❌ Error saving merged sessions:', error);
      });
    }
    
      // If changes were made during sync, trigger another sync immediately
      if (hasChangesDuringSync) {
        console.log('🔄 Changes detected during sync - triggering follow-up sync to push local changes');
        // Increment autoSyncTrigger to trigger the GoogleCalendarSyncService
        setAutoSyncTrigger(prev => prev + 1);
      }
  };

  /**
   * Handle sessions deleted from Google Calendar
   * Delete them from the backend database to prevent re-syncing
   */
  const handleSessionsDeleted = async (sessionIds: string[]) => {
    console.log('🗑️ App: Deleting sessions from backend database:', sessionIds);
    
    // First, get the sessions to determine which courses are affected
    const deletedSessions = scheduledSessions.filter(s => sessionIds.includes(s.id));
    const affectedCourseIds = new Set(deletedSessions.map(s => s.courseId).filter(Boolean));
    
    console.log('📊 Affected courses:', Array.from(affectedCourseIds));
    
    for (const sessionId of sessionIds) {
      try {
        await apiDeleteSession(sessionId);
        console.log(`✅ Deleted session ${sessionId} from backend`);
      } catch (error) {
        // Check if error is "Session not found" - this is expected if session was already deleted
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Session not found') || errorMessage.includes('not found')) {
          console.log(`ℹ️ Session ${sessionId} already deleted from backend (expected)`);
        } else {
          console.error(`❌ Failed to delete session ${sessionId} from backend:`, error);
        }
      }
    }
    
    // Remove from React state and recalculate scheduled hours for affected courses
    const remainingSessions = scheduledSessions.filter(s => !sessionIds.includes(s.id));
    
    // Recalculate scheduledHours for all courses based on remaining sessions
    // scheduledHours = only FUTURE sessions (date >= today) assigned to course
    console.log('🔄 Recalculating scheduled hours after deletion...');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const scheduledHoursByCourse = new Map<string, number>();
    
    for (const session of remainingSessions) {
      // Skip unassigned sessions (blockers) - they don't count toward course hours
      if (!session.courseId) continue;
      
      // Only count FUTURE sessions (date >= today) for scheduledHours
      if (session.date < today) continue;
      
      const hours = session.durationMinutes / 60;
      const current = scheduledHoursByCourse.get(session.courseId) || 0;
      scheduledHoursByCourse.set(session.courseId, current + hours);
    }
    
    // Check which courses have no sessions left and should be deactivated
    const courseSessionCounts = new Map<string, number>();
    for (const session of remainingSessions) {
      if (session.courseId) {
        courseSessionCounts.set(session.courseId, (courseSessionCounts.get(session.courseId) || 0) + 1);
      }
    }
    
    // Identify courses to deactivate (active but no sessions)
    const coursesToDeactivate: string[] = [];
    
    // Update courses with recalculated scheduled hours and deactivate if no sessions
    setCourses(prevCourses => prevCourses.map(course => {
      const newScheduledHours = scheduledHoursByCourse.get(course.id) || 0;
      const hasAnySessions = courseSessionCounts.has(course.id);
      
      // Deactivate course if it's active but has no sessions left
      let newStatus = course.status;
      if (course.status === 'active' && !hasAnySessions) {
        newStatus = 'planned';
        coursesToDeactivate.push(course.id);
        console.log(`📦 Deactivating course ${course.name} - no sessions remaining`);
      }
      
      if (affectedCourseIds.has(course.id)) {
        console.log(`📉 Course ${course.name}: ${course.scheduledHours}h → ${newScheduledHours}h`);
      }
      
      return {
        ...course,
        scheduledHours: newScheduledHours,
        status: newStatus
      };
    }));
    
    // Update sessions state
    setScheduledSessions(remainingSessions);
    
    // Persist status changes to backend for deactivated courses
    for (const courseId of coursesToDeactivate) {
      try {
        // Use extended API which supports status field
        await apiUpdateCourseExtended(courseId, { status: 'planned' });
        const course = courses.find(c => c.id === courseId);
        console.log(`✅ Deactivated course ${course?.name || courseId} on backend`);
      } catch (error) {
        console.error(`❌ Failed to deactivate course ${courseId}:`, error);
      }
    }
  };

  // Drag to create session from calendar
  const [createSessionData, setCreateSessionData] = useState<{ date: string; startTime: string; endTime: string } | null>(null);
  
  const handleCreateSessionFromCalendar = (date: string, startTime: string, endTime: string) => {
    setCreateSessionData({ date, startTime, endTime });
    setEditingSession(undefined);
    setShowSessionDialog(true);
  };

  // Handle moving session (drag-and-drop)
  const handleSessionMove = (session: ScheduledSession, newDate: string, newStartTime: string, newEndTime: string) => {
    // Save the original session before moving
    setOriginalSessionBeforeMove(session);
    
    // Calculate duration for the moved session
    // For multi-day sessions, we need to preserve the endDate or use newDate
    const newEndDate = session.endDate || newDate;
    const newDuration = calculateDuration(newStartTime, newEndTime, newDate, newEndDate);
    
    // Update the session with new date and time temporarily for preview
    setScheduledSessions(prev => prev.map(s => 
      s.id === session.id 
        ? { 
            ...s, 
            date: newDate,
            endDate: session.endDate ? newEndDate : undefined,
            startTime: newStartTime, 
            endTime: newEndTime,
            durationMinutes: newDuration
          } 
        : s
    ));

    // Open dialog to edit the moved session
    setCreateSessionData(null); // Clear create session data
    setEditingSession({
      ...session,
      date: newDate,
      endDate: session.endDate ? newEndDate : undefined,
      startTime: newStartTime,
      endTime: newEndTime,
      durationMinutes: newDuration
    });
    setShowSessionDialog(true);
  };

  // Gate: show auth screen if not authenticated yet
  if (!authChecked || !isAuthenticated()) {
    return (
      <AuthScreen
        onAuthenticated={async (auth: AuthResponse) => {
          // After auth, re-run migration logic
          setMigrating(true);
          try {
            setCurrentUserId(auth.user.id);
            const onboardKey = `hasOnboarded:${auth.user.id}`;
            const program = await apiGetStudyProgram();
            setStudyProgram(program);
            
            // Load courses and sessions first
            let courses: Course[];
            let sessions: ScheduledSession[];
            
            if (auth.user.email && auth.user.email.toLowerCase() === dominickEmail.toLowerCase()) {
              const migrated = await migrateIfEmpty({
                courses: legacyInitialCourses,
                sessions: legacyInitialSessions,
              });
              courses = migrated.courses as Course[];
              sessions = migrated.sessions as ScheduledSession[];
            } else {
              // For non-Dominick users, do not migrate legacy data; just load what's in backend (likely empty)
              const [loadedCourses, loadedSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
              courses = loadedCourses as Course[];
              sessions = loadedSessions as ScheduledSession[];
            }
            
            // Force progress bars to recalculate from sessions immediately after login
            {
              const now = new Date();
              const scheduledHoursByCourse = new Map<string, number>();
              const completedHoursByCourse = new Map<string, number>();
              for (const s of sessions) {
                if (!s.courseId) continue;
                const end = new Date(`${s.date}T${s.endTime}`);
                const hours = s.durationMinutes / 60;
                if (end > now && !s.completed) {
                  scheduledHoursByCourse.set(s.courseId, (scheduledHoursByCourse.get(s.courseId) || 0) + hours);
                }
                if (s.completed) {
                  completedHoursByCourse.set(s.courseId, (completedHoursByCourse.get(s.courseId) || 0) + hours);
                }
              }
              const recalculatedCourses = courses.map(c => {
                const completedHours = completedHoursByCourse.get(c.id) || 0;
                const scheduledHours = scheduledHoursByCourse.get(c.id) || 0;
                const progress = Math.min(Math.round((completedHours / c.estimatedHours) * 100), 100);
                return { ...c, completedHours, scheduledHours, progress } as Course;
              });
              setCourses(recalculatedCourses);
              setScheduledSessions(sessions);
            }
            
            // Calculate completed ECTS from completed courses and sync with backend if needed
            const completedCoursesECTS = courses
              .filter(c => c.status === 'completed')
              .reduce((sum, c) => sum + c.ects, 0);
            
            // If backend completedECTS doesn't match actual completed courses, sync it
            // Only do this if program was loaded successfully
            if (program && program.completedECTS !== completedCoursesECTS) {
              try {
                const updated = await apiUpdateStudyProgram({ completedECTS: completedCoursesECTS });
                setStudyProgram(updated);
              } catch (err) {
                console.error('Failed to sync completedECTS with completed courses', err);
                // Still update local state even if backend fails
                setStudyProgram(prev => ({ ...prev, completedECTS: completedCoursesECTS }));
              }
            }
            
            // Show onboarding only for new users who haven't completed setup and have no data
            if (!localStorage.getItem(onboardKey) && courses.length === 0 && sessions.length === 0) {
              setShowOnboarding(true);
            }
          } catch (e) {
            console.error('Initial load after auth failed', e);
            // If data load fails after authentication, clear auth token and force re-login
            logout();
            alert('Fehler beim Laden der Daten. Bitte melde dich erneut an oder stelle sicher, dass der Server läuft.');
          } finally {
            setMigrating(false);
            setAuthChecked(true);
          }
        }}
      />
    );
  }

  const requiredReplanMinutes = missedSession?.durationMinutes ?? 0;
  const hasReplanCoverage = replanCandidates.length > 0 && replanTotalMinutes >= requiredReplanMinutes;
  const missingReplanMinutes = Math.max(0, requiredReplanMinutes - replanTotalMinutes);

  return (
    <div className="h-screen lg:overflow-hidden bg-gray-50 flex flex-col">
      {migrating && (
        <div className="fixed inset-0 bg-white/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="p-6 rounded-lg bg-white shadow-md space-y-2">
            <p className="font-medium">Daten werden geladen…</p>
            <p className="text-sm text-gray-600">Bitte warten, während deine Kurse und Sessions synchronisiert werden.</p>
          </div>
        </div>
      )}
      {/* App Header - Desktop */}
      <header className="hidden lg:block bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-gray-900 text-2xl">Intelligent Study Planner</h1>
            
            {/* Desktop Navigation */}
            <nav className="flex items-center gap-3">
              <Button
                variant={currentView === 'dashboard' ? 'default' : 'outline'}
                size="lg"
                onClick={() => setCurrentView('dashboard')}
                className={currentView === 'dashboard' 
                  ? 'bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md' 
                  : 'font-semibold'}
              >
                Start
              </Button>
              <Button
                variant={currentView === 'courses' ? 'default' : 'outline'}
                size="lg"
                onClick={() => setCurrentView('courses')}
                className={currentView === 'courses' 
                  ? 'bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md' 
                  : 'font-semibold'}
              >
                Kurse
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  logout();
                  window.location.reload();
                }}
                className="font-semibold"
              >
                Abmelden
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <OnboardingDialog 
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
      />

      <PastSessionsReviewDialog
        open={showPastSessionsReview}
        onClose={() => setShowPastSessionsReview(false)}
        sessions={getPastUnevaluatedSessions()}
        courses={courses}
        onSelectSession={(session) => {
          setFeedbackSession(session);
          setShowAttendanceDialog(true);
        }}
      />

      <SessionAttendanceDialog
        open={showAttendanceDialog}
        onClose={() => {
          setShowAttendanceDialog(false);
          setFeedbackSession(null);
        }}
        session={feedbackSession}
        course={feedbackSession ? courses.find(c => c.id === feedbackSession.courseId) : undefined}
        onAttended={handleSessionAttended}
        onNotAttended={handleSessionNotAttended}
      />

      <SessionFeedbackDialog 
        open={showFeedbackDialog}
        onClose={() => {
          setShowFeedbackDialog(false);
          setFeedbackSession(null);
        }}
        session={feedbackSession}
        course={feedbackSession ? courses.find(c => c.id === feedbackSession.courseId) || null : null}
        courses={courses}
        onSubmit={handleSessionFeedback}
        onCreateNewCourse={() => {
          setShowFeedbackDialog(false);
          setShowCourseDialog(true);
        }}
        skipAttendanceQuestion={true}
      />

      {/* Replan missed session prompt */}
      <AlertDialog
        open={showReplanDialog}
        onOpenChange={(open) => {
          if (!open) {
            // If the dialog is being closed without an explicit choice, apply default: mark as not attended
            // Use setTimeout to allow state updates from button clicks to process first
            setTimeout(() => {
              if (!replanHandled && missedSession) {
                applyNotAttendedWithoutReplan(missedSession);
              }
            }, 0);
            setShowReplanDialog(false);
            setMissedSession(null);
            setReplanCandidates([]);
            setReplanTotalMinutes(0);
            setReplanHandled(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session nicht wahrgenommen</AlertDialogTitle>
            {/* Hidden description for accessibility; visual text kept below for layout flexibility */}
            <AlertDialogDescription className="sr-only">
              Dialog zur Behandlung einer nicht wahrgenommenen Session und optionaler automatischer Neuplanung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-sm text-gray-700 space-y-2">
            {hasReplanCoverage ? (
              <p>
                Moechtest du die verpasste Session automatisch in die naechsten freien Study Sessions verschieben?<br />
                Neue Slots: {replanCandidates.length} - Geplante Minuten: {replanTotalMinutes} / Benoetigt: {requiredReplanMinutes}
              </p>
            ) : (
              <p>
                Nicht genug freie Study Sessions gefunden. Fehlende Minuten: {missingReplanMinutes}. Die Session wird als nicht wahrgenommen markiert.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            {hasReplanCoverage ? (
              <>
                <AlertDialogCancel
                  onClick={() => {
                    if (missedSession) {
                      applyNotAttendedWithoutReplan(missedSession);
                    }
                    setReplanHandled(true);
                    setShowReplanDialog(false);
                  }}
                  className="border-gray-300 hover:border-gray-400"
                >
                  Nur markieren
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (missedSession && replanCandidates.length) {
                      applyNotAttendedWithReplan(missedSession, replanCandidates);
                    }
                    setReplanHandled(true);
                    setShowReplanDialog(false);
                  }}
                  className="bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md border border-gray-700"
                >
                  Ja, neu einplanen
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => {
                  if (missedSession) {
                    applyNotAttendedWithoutReplan(missedSession);
                  }
                  setReplanHandled(true);
                  setShowReplanDialog(false);
                }}
                className="bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md border border-gray-700"
              >
                OK
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CourseDialog
        open={showCourseDialog}
        onClose={() => {
          setShowCourseDialog(false);
          setEditingCourse(undefined);
        }}
        onSave={handleSaveCourse}
        course={editingCourse}
      />

      <StudyBlockDialog
        open={showBlockDialog}
        onClose={() => {
          setShowBlockDialog(false);
          setEditingBlock(undefined);
        }}
        onSave={handleSaveBlock}
        block={editingBlock}
      />

      <SessionDialog
        open={showSessionDialog}
        onClose={() => {
          // If we have an original session (from drag-and-drop), restore it
          if (originalSessionBeforeMove) {
            setScheduledSessions(prev => prev.map(s => 
              s.id === originalSessionBeforeMove.id 
                ? originalSessionBeforeMove
                : s
            ));
            setOriginalSessionBeforeMove(null);
          }
          
          setShowSessionDialog(false);
          setEditingSession(undefined);
          setCreateSessionData(null);
          setPreviewSession(null);
        }}
        onSave={handleSaveSession}
        onDelete={handleDeleteSession}
        session={editingSession}
        courses={courses}
        sessions={scheduledSessions}
        onCreateCourse={(draft) => {
          setPendingSessionDraft(draft);
          setPendingSelectCourseId(null);
          handleAddCourse();
        }}
        initialDate={createSessionData?.date}
        initialStartTime={createSessionData?.startTime}
        initialEndTime={createSessionData?.endTime}
        initialCourseId={pendingSelectCourseId ?? undefined}
        onPreviewChange={setPreviewSession}
      />
      
  {/* TODO: Pass blockers to Dashboard/CalendarView for rendering as unassigned sessions */}
  <div className="flex-1 overflow-hidden pb-20 lg:pb-0">
        {currentView === 'dashboard' && (
          <Dashboard 
            courses={courses}
            studyProgram={studyProgram}
            scheduledSessions={scheduledSessions}
            onSessionClick={handleEditSession}
            onViewChange={setCurrentView}
            currentView={currentView}
            onCreateSession={handleCreateSessionFromCalendar}
            onEditCourse={handleEditCourse}
            onSessionMove={handleSessionMove}
            onSessionsImported={handleSessionsImported}
            onSessionsDeleted={handleSessionsDeleted}
            autoSyncTrigger={autoSyncTrigger}
            previewSession={previewSession}
            editingSessionId={editingSession?.id}
            isDialogOpen={showSessionDialog || showAttendanceDialog || showFeedbackDialog || showPastSessionsReview || showCourseDialog || showBlockDialog || showReplanDialog}
          />
        )}

        {currentView === 'courses' && (
          <CoursesView
            courses={courses}
            scheduledSessions={scheduledSessions}
            onAddCourse={handleAddCourse}
            onEditCourse={handleEditCourse}
            onDeleteCourse={handleDeleteCourse}
            onRequestDeleteCourse={requestDeleteCourse}
            onCompleteCourse={handleCompleteCourse}
            onViewChange={setCurrentView}
          />
        )}

        {currentView === 'courses' && (
          <CoursesViewAddButton onAddCourse={handleAddCourse} />
        )}

        {/* Calendar view removed (not in use) */}
      </div>

      {/* Mobile Bottom Navigation - Only visible on mobile */}
      <div className="lg:hidden">
        <BottomNavigation 
          currentView={currentView}
          onViewChange={setCurrentView}
          onLogout={() => {
            // Clear auth and force the auth gate to show
            logout();
            setAuthChecked(false);
            setCurrentView('dashboard');
            // Optional: clear lightweight UI states to avoid residual views
            setShowOnboarding(false);
            setShowPastSessionsReview(false);
            setShowAttendanceDialog(false);
            setShowFeedbackDialog(false);
            setShowReplanDialog(false);
          }}
        />
      </div>

      {/* Delete Course Confirmation Dialog */}
      <Dialog open={showDeleteCourseDialog} onOpenChange={setShowDeleteCourseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kurs löschen</DialogTitle>
            <DialogDescription>
              {courseToDelete ? `Möchtest du den Kurs "${courseToDelete.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.` : 'Möchtest du diesen Kurs wirklich löschen?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setShowDeleteCourseDialog(false); setCourseToDelete(undefined); }}>
              Abbrechen
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => courseToDelete && handleDeleteCourse(courseToDelete.id)}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;






