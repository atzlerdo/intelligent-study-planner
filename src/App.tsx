import { useState, useEffect } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { SessionAttendanceDialog } from './components/sessions/SessionAttendanceDialog';
import { SessionFeedbackDialog } from './components/sessions/SessionFeedbackDialog';
import { PastSessionsReviewDialog } from './components/sessions/PastSessionsReviewDialog';
import { BottomNavigation } from './components/layout/BottomNavigation';
import { CoursesView } from './components/courses/CoursesView';
import { CourseDialog } from './components/courses/CourseDialog';
import { StudyBlockDialog } from './components/StudyBlockDialog';
import { CalendarView } from './components/CalendarView';
import { SessionDialog } from './components/SessionDialog';
import { OnboardingDialog } from './components/OnboardingDialog';
import { Button } from './components/ui/button';
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
import { isAuthenticated, migrateIfEmpty, logout, createCourse as apiCreateCourse, updateCourse as apiUpdateCourse, deleteCourse as apiDeleteCourse, createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession, getCourses as apiGetCourses, getSessions as apiGetSessions, getStudyProgram as apiGetStudyProgram, updateStudyProgram as apiUpdateStudyProgram } from './lib/api';
import type { AuthResponse } from './lib/api';
import { AuthScreen } from './components/auth/AuthScreen';
import { calculateWeeklyAvailableMinutes, calculateEstimatedEndDate, calculateDuration } from './lib/scheduler';
import { generateMockSessions } from './lib/mockSessions';

function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showPastSessionsReview, setShowPastSessionsReview] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'courses' | 'calendar'>('dashboard');
  const [autoSyncTrigger, setAutoSyncTrigger] = useState<number>(0);
  // Replan missed session dialog state
  const [showReplanDialog, setShowReplanDialog] = useState(false);
  const [replanCandidate, setReplanCandidate] = useState<ScheduledSession | null>(null);
  const [missedSession, setMissedSession] = useState<ScheduledSession | null>(null);
  const [replanHandled, setReplanHandled] = useState(false);
  
  // Study program state (loaded from backend; fallback defaults used until fetched)
  const [studyProgram, setStudyProgram] = useState<StudyProgram>({
    totalECTS: 180,
    completedECTS: 0,
    hoursPerECTS: 27.5,
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Trigger sync when dashboard view is shown
  useEffect(() => {
    if (currentView === 'dashboard') {
      setAutoSyncTrigger(Date.now());
    }
  }, [currentView]);

  // Initial client-only onboarding check removed; handled after auth per user
  useEffect(() => {
    // no-op, reserved for future non-auth initialization
  }, []);

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
        setCourses(courses as Course[]);
        setScheduledSessions(sessions as ScheduledSession[]);
        setStudyProgram(program);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dialog states
  const [showCourseDialog, setShowCourseDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | undefined>();
  const [editingBlock, setEditingBlock] = useState<StudyBlock | undefined>();
  const [editingSession, setEditingSession] = useState<ScheduledSession | undefined>();
  const [feedbackSession, setFeedbackSession] = useState<ScheduledSession | null>(null);
  const [originalSessionBeforeMove, setOriginalSessionBeforeMove] = useState<ScheduledSession | null>(null);
  const [previewSession, setPreviewSession] = useState<ScheduledSession | null>(null);

  // Clear preview session when navigating away or closing dialog
  useEffect(() => {
    if (!showSessionDialog) {
      setPreviewSession(null);
    }
  }, [showSessionDialog]);

  // Calculate weekly capacity
  const weeklyCapacity = calculateWeeklyAvailableMinutes(studyBlocks);

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
  const handleSessionFeedback = (feedback: { 
    sessionId: string; 
    completed: boolean; 
    completedHours: number;
    selfAssessmentProgress: number;
    completedMilestones?: string[];
    newMilestones?: string[];
    selectedCourseId?: string;
  }) => {
    // If this is an unassigned session with a selected course, assign it
    if (feedback.selectedCourseId && feedbackSession && !feedbackSession.courseId) {
      const updatedSession = { ...feedbackSession, courseId: feedback.selectedCourseId };
      setFeedbackSession(updatedSession);
      
      // Update the session in scheduledSessions
      setScheduledSessions(prev => prev.map(s => 
        s.id === feedbackSession.id 
          ? { 
              ...updatedSession,
              completed: feedback.completed,
              completionPercentage: feedback.selfAssessmentProgress 
            }
          : s
      ));

      // Activate the course if it's in 'planned' status
      setCourses(prev => prev.map(c => 
        c.id === feedback.selectedCourseId && c.status === 'planned'
          ? { ...c, status: 'active' }
          : c
      ));

      console.log('Assigned course to unassigned session:', feedback.selectedCourseId, feedbackSession.id);
    } else {
      // Update the session normally (for already assigned sessions)
      setScheduledSessions(prev => prev.map(session => 
        session.id === feedback.sessionId 
          ? { 
              ...session, 
              completed: feedback.completed,
              completionPercentage: feedback.selfAssessmentProgress 
            } 
          : session
      ));
    }

    // Update course progress and milestones
    setCourses(prevCourses => {
      return prevCourses.map(course => {
        const targetCourseId = feedback.selectedCourseId || feedbackSession?.courseId;
        if (feedbackSession && course.id === targetCourseId) {
          const newCompletedHours = course.completedHours + feedback.completedHours;
          const newProgress = Math.round((newCompletedHours / course.estimatedHours) * 100);
          
          // Add new milestones if any
          let updatedMilestones = course.milestones || [];
          if (feedback.newMilestones && feedback.newMilestones.length > 0) {
            const newMilestoneObjects = feedback.newMilestones.map(title => ({
              id: `milestone-${Date.now()}-${Math.random()}`,
              title,
              deadline: '',
              completed: true, // Just created milestones are marked as completed
            }));
            updatedMilestones = [...updatedMilestones, ...newMilestoneObjects];
          }
          
          // Mark completed milestones
          if (feedback.completedMilestones && feedback.completedMilestones.length > 0) {
            updatedMilestones = updatedMilestones.map(m => 
              feedback.completedMilestones!.includes(m.id) ? { ...m, completed: true } : m
            );
          }
          
          return {
            ...course,
            completedHours: newCompletedHours,
            progress: Math.min(newProgress, 100),
            milestones: updatedMilestones,
          };
        }
        return course;
      });
    });
    
    setShowFeedbackDialog(false);
    setFeedbackSession(null);
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
        await apiCreateCourse({
          name: courseData.name,
          type: courseData.type,
          ects: courseData.ects,
          estimatedHours: courseData.estimatedHours,
          estimatedEndDate,
          examDate: courseData.examDate,
          semester: courseData.semester,
        });
      }
      // Refresh from backend
      const [courses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(courses as Course[]);
      setScheduledSessions(sessions as ScheduledSession[]);
    } catch (e) {
      console.error('Course save failed', e);
    } finally {
      setEditingCourse(undefined);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm('Möchtest du diesen Kurs wirklich löschen?')) return;
    try {
      await apiDeleteCourse(courseId);
      const [courses, sessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(courses as Course[]);
      setScheduledSessions(sessions as ScheduledSession[]);
    } catch (e) {
      console.error('Delete course failed', e);
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
    
    if (sessionEndDate < now && !session.completed) {
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

  // Find the next unassigned study session in the future
  const findNextUnassignedSession = (after: Date): ScheduledSession | null => {
    const candidates = scheduledSessions
      .filter((s) => !s.courseId && !s.completed && parseLocalDateTime(s.date, s.startTime).getTime() > after.getTime())
      .sort((a, b) => parseLocalDateTime(a.date, a.startTime).getTime() - parseLocalDateTime(b.date, b.startTime).getTime());
    return candidates[0] || null;
  };

  // Apply: user did not attend and does NOT want automatic replanning
  const applyNotAttendedWithoutReplan = (session: ScheduledSession) => {
    const course = courses.find((c) => c.id === session.courseId);
    if (!course) return;

    // Mark missed session completed with 0%
    setScheduledSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, completed: true, completionPercentage: 0 } : s))
    );

    // Decrease scheduled hours previously allocated
    const sessionHours = session.durationMinutes / 60;
    setCourses((prev) =>
      prev.map((c) => (c.id === session.courseId ? { ...c, scheduledHours: Math.max(0, c.scheduledHours - sessionHours) } : c))
    );
  };

  // Apply: user did not attend and WANTS automatic replanning into next unassigned session
  const applyNotAttendedWithReplan = (session: ScheduledSession, target: ScheduledSession) => {
    const course = courses.find((c) => c.id === session.courseId);
    if (!course) return;

    const missedHours = session.durationMinutes / 60;
    const targetHours = target.durationMinutes / 60;

    // 1) Remove the missed session AND assign the target session in a single state update
    setScheduledSessions((prev) => 
      prev
        .filter((s) => s.id !== session.id) // Remove missed session
        .map((s) => (s.id === target.id ? { ...s, courseId: session.courseId } : s)) // Assign target
    );

    // 2) Update course hours: decrease for missed, increase for target
    setCourses((prev) =>
      prev.map((c) => 
        c.id === session.courseId 
          ? { 
              ...c, 
              scheduledHours: c.scheduledHours - missedHours + targetHours,
              status: c.status === 'planned' ? 'active' : c.status 
            } 
          : c
      )
    );
  };

  const handleSessionNotAttended = () => {
    if (!feedbackSession) return;

    // Determine next unassigned session
    const now = new Date();
    const candidate = findNextUnassignedSession(now);

    // Store state for replan prompt
    setMissedSession(feedbackSession);
    setReplanCandidate(candidate);
    
    // Close attendance dialog first
    setShowAttendanceDialog(false);
    setFeedbackSession(null);
    
    // Open replan prompt after a delay to ensure attendance dialog overlay is fully removed
    setTimeout(() => {
      setShowReplanDialog(true);
    }, 300);
  };

  const handleSaveSession = async (sessionData: Omit<ScheduledSession, 'id'>) => {
    console.log('💾 Saving Session:', {
      isEditing: !!editingSession,
      sessionData: {
        date: sessionData.date,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        course: sessionData.courseId,
        duration: sessionData.durationMinutes
      },
      currentTime: new Date().toString()
    });
    
    try {
      if (editingSession) {
        await apiUpdateSession(editingSession.id, {
          courseId: sessionData.courseId,
          studyBlockId: sessionData.studyBlockId,
          date: sessionData.date,
          startTime: sessionData.startTime,
          endDate: sessionData.endDate,
          endTime: sessionData.endTime,
          durationMinutes: sessionData.durationMinutes,
          notes: sessionData.notes,
          // Forward recurrence data when present
          ...(sessionData.recurrence ? { recurrence: sessionData.recurrence } : {}),
        });
      } else {
        await apiCreateSession({
          courseId: sessionData.courseId,
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
        // TODO: Implement proper recurring server-side; currently we only create the single session
      }
      const [freshCourses, freshSessions] = await Promise.all([apiGetCourses(), apiGetSessions()]);
      setCourses(freshCourses as Course[]);
      setScheduledSessions(freshSessions as ScheduledSession[]);
      // Auto-activate course if planned
      if (sessionData.courseId) {
        const course = freshCourses.find(c => c.id === sessionData.courseId);
        if (course && course.status === 'planned') {
          const token = localStorage.getItem('authToken');
          await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/courses/${course.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ status: 'active' }),
          });
          const again = await apiGetCourses();
            setCourses(again as Course[]);
        }
      }
    } catch (e) {
      console.error('Save session failed', e);
    }
    
    // Clear state and close dialog
    setOriginalSessionBeforeMove(null);
    setEditingSession(undefined);
    setShowSessionDialog(false);
    
    // Trigger auto-sync
    setAutoSyncTrigger(Date.now());
  };

  const handleDeleteSession = async (sessionId: string) => {
    console.log(`🗑️ App: Deleting session ${sessionId}`);
    try {
      await apiDeleteSession(sessionId);
    } catch (e) {
      console.error('Delete session API failed (will still update local state)', e);
    }

    setScheduledSessions(prev => {
      // Check if this is an expanded instance (has underscore in ID like "master_2025-11-11")
      // If so, we need to delete the recurring master instead
      let targetId = sessionId;
      const session = prev.find(s => s.id === sessionId);
      
      if (!session) {
        // Session not found in state - might be an expanded instance
        // Extract master ID by removing the date suffix
        if (sessionId.includes('_')) {
          const masterId = sessionId.split('_')[0];
          const master = prev.find(s => s.id === masterId && s.recurrence);
          if (master) {
            console.log(`  ⚠️ Session ${sessionId} is an expanded instance. Deleting master ${masterId} instead.`);
            targetId = masterId;
          } else {
            console.warn(`  ❌ Could not find master session ${masterId} for expanded instance ${sessionId}`);
            return prev; // Don't delete anything if we can't find the master
          }
        } else {
          console.warn(`  ❌ Session ${sessionId} not found in state`);
          return prev;
        }
      }
      
      const filtered = prev.filter(s => s.id !== targetId);
      console.log(`  Sessions after deletion: ${filtered.length} (was ${prev.length})`);
      console.log(`  Recurring masters remaining: ${filtered.filter(s => s.recurrence).length}`);
      console.log(`  Expanded instances remaining (should be 0): ${filtered.filter(s => s.recurringEventId && !s.recurrence).length}`);
      return filtered;
    });
    
    // Clear state and close dialog
    setOriginalSessionBeforeMove(null);
    setEditingSession(undefined);
    setShowSessionDialog(false);
    
    // Trigger auto-sync
    setAutoSyncTrigger(Date.now());
  };

  // Handle sessions imported from Google Calendar
  const handleSessionsImported = (importedSessions: ScheduledSession[], syncStartTime?: number) => {
    console.log('📥 App: Importing sessions from Google Calendar:', importedSessions.length);
    
    // Track if any changes were made during sync (need to re-sync)
    let hasChangesDuringSync = false;
    
    // To prevent race conditions where sessions are added during sync:
    // 1. Get current app state (which may include new sessions added during sync)
    // 2. Merge synced sessions with any new local sessions not yet synced
  setScheduledSessions(currentSessions => {
      console.log('🔁 App: Merging synced sessions with current app state');
      console.log('  Current sessions in app:', currentSessions.length);
      console.log('  Current recurring masters:', currentSessions.filter(s => s.recurrence).map(s => ({ id: s.id, rrule: s.recurrence?.rrule })));
      console.log('  Current expanded instances:', currentSessions.filter(s => s.recurringEventId && !s.recurrence).map(s => ({ id: s.id, masterId: s.recurringEventId })));
      console.log('  Synced sessions from Google:', importedSessions.length);
      console.log('  Synced recurring masters:', importedSessions.filter(s => s.recurrence).map(s => ({ id: s.id, rrule: s.recurrence?.rrule })));
      
      // Build maps for efficient lookup
      const syncedById = new Map(importedSessions.map(s => [s.id, s]));
      const currentById = new Map(currentSessions.map(s => [s.id, s]));
      
      // CRITICAL: Merge local and synced sessions with conflict resolution
      // Strategy: For each session ID, choose the version with the newer lastModified timestamp
      const sessionById = new Map<string, ScheduledSession>();
      
      // First, add all synced sessions (authoritative from server)
      for (const syncedSession of importedSessions) {
        sessionById.set(syncedSession.id, syncedSession);
      }
      
      // Then, check current sessions for conflicts or new additions
      for (const [id, currentSession] of currentById) {
        const syncedSession = syncedById.get(id);
        
        // Skip expanded instances - they're generated from recurring masters
        if (currentSession.recurringEventId && !currentSession.recurrence) {
          console.log(`⏭️ Skipping expanded instance ${id} (generated from recurring master ${currentSession.recurringEventId})`);
          continue;
        }
        
        if (syncedSession) {
          // Session exists in both - resolve conflict by timestamp
          const currentMod = currentSession.lastModified || 0;
          const syncedMod = syncedSession.lastModified || 0;
          
          if (syncStartTime && currentMod > syncStartTime) {
            // Local session was modified DURING the sync - prefer local (user's latest change)
            console.log(`🔄 Conflict: Session ${id} modified during sync - preserving local changes (local: ${new Date(currentMod).toISOString()}, synced: ${new Date(syncedMod).toISOString()})`);
            sessionById.set(id, currentSession);
            hasChangesDuringSync = true; // Mark for re-sync
          } else if (syncedMod > currentMod) {
            // Synced version is newer - already in map, do nothing
            console.log(`✅ Using synced version of ${id} (newer: synced ${new Date(syncedMod).toISOString()} > local ${new Date(currentMod).toISOString()})`);
          } else {
            // Local version is newer but wasn't modified during sync - prefer local
            console.log(`✅ Using local version of ${id} (newer: local ${new Date(currentMod).toISOString()} > synced ${new Date(syncedMod).toISOString()})`);
            sessionById.set(id, currentSession);
          }
        } else {
          // Session only in current state (not in sync result)
          const currentMod = currentSession.lastModified || 0;
          if (syncStartTime && currentMod > syncStartTime) {
            // Created during sync - add it
            console.log(`➕ Preserving local session ${id} created during sync`);
            sessionById.set(id, currentSession);
            hasChangesDuringSync = true; // Mark for re-sync
          } else {
            // Old session not in sync result - was deleted
            console.log(`⏭️ Skipping local session ${id} - not in sync result (likely deleted)`);
          }
        }
      }
      
      const finalSessions = Array.from(sessionById.values());
      
      console.log('  Final merged sessions:', finalSessions.length);
      console.log('  Final recurring masters:', finalSessions.filter(s => s.recurrence).map(s => ({ id: s.id, rrule: s.recurrence?.rrule })));
      console.log('  Final expanded instances (should be 0):', finalSessions.filter(s => s.recurringEventId && !s.recurrence).length);
      
      // Recalculate scheduledHours for all courses based on merged sessions
      console.log('🔄 Recalculating scheduled hours for all courses...');
      const scheduledHoursByCourse = new Map<string, number>();
      
      for (const session of finalSessions) {
        // Skip unassigned sessions (blockers) - they don't count toward course hours
        if (!session.courseId) continue;
        
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
    
      // If changes were made during sync, trigger another sync immediately
      if (hasChangesDuringSync) {
        console.log('🔄 Changes detected during sync - triggering follow-up sync to push local changes');
        // Increment autoSyncTrigger to trigger the GoogleCalendarSyncService
        setAutoSyncTrigger(prev => prev + 1);
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
            
            setCourses(courses);
            setScheduledSessions(sessions);
            
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
            if (missedSession && !replanHandled) {
              applyNotAttendedWithoutReplan(missedSession);
            }
            setShowReplanDialog(false);
            setMissedSession(null);
            setReplanCandidate(null);
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
            {replanCandidate ? (
              <p>
                Möchtest du die verpasste Session automatisch in die nächste nicht zugewiesene Study Session verschieben?<br />
                Vorschlag: {new Date(`${replanCandidate.date}T${replanCandidate.startTime}`).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : (
              <p>
                Es wurde keine zukünftige, nicht zugewiesene Study Session gefunden. Lege in deinem Kalender freie
                <span className="font-medium"> "📚 Study Session"</span>-Slots an – dann kann die App verpasste Sessions automatisch dorthin verschieben.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            {replanCandidate ? (
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
                    if (missedSession && replanCandidate) {
                      applyNotAttendedWithReplan(missedSession, replanCandidate);
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
        onCreateCourse={handleAddCourse}
        initialDate={createSessionData?.date}
        initialStartTime={createSessionData?.startTime}
        initialEndTime={createSessionData?.endTime}
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
            onCompleteCourse={handleCompleteCourse}
            onViewChange={setCurrentView}
          />
        )}

        {currentView === 'calendar' && (
          <CalendarView
            sessions={scheduledSessions}
            courses={courses}
            onAddSession={handleAddSession}
            onEditSession={handleEditSession}
            onDeleteSession={handleDeleteSession}
            onViewChange={setCurrentView}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation - Only visible on mobile */}
      <div className="lg:hidden">
        <BottomNavigation 
          currentView={currentView}
          onViewChange={setCurrentView}
        />
      </div>
    </div>
  );
}

export default App;
