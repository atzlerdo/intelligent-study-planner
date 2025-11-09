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
import type { Course, StudyBlock, StudyProgram, ScheduledSession } from './types';
import { calculateWeeklyAvailableMinutes, generateSchedule, calculateEstimatedEndDate, calculateDuration } from './lib/scheduler';
import { generateMockSessions } from './lib/mockSessions';

function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showPastSessionsReview, setShowPastSessionsReview] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'courses' | 'calendar'>('dashboard');
  const [autoSyncTrigger, setAutoSyncTrigger] = useState<number>(0);
  
  // Study program state - Default: 95 ECTS completed out of 180 (19 of 36 modules done)
  const [studyProgram, setStudyProgram] = useState<StudyProgram>({
    totalECTS: 180,
    completedECTS: 90,
    hoursPerECTS: 27.5,
  });

  // Check if onboarding is needed on first load
  useEffect(() => {
    const hasOnboarded = localStorage.getItem('hasOnboarded');
    if (!hasOnboarded) {
      setShowOnboarding(true);
    } else {
      // Load study program from localStorage if available
      const savedProgram = localStorage.getItem('studyProgram');
      if (savedProgram) {
        const parsed = JSON.parse(savedProgram);
        // Ensure we have at least the default values if localStorage is corrupted
        if (parsed.completedECTS === 0 && parsed.totalECTS === 180) {
          // Override with real study progress
          setStudyProgram({
            totalECTS: 180,
            completedECTS: 90,
            hoursPerECTS: 27.5,
          });
          localStorage.setItem('studyProgram', JSON.stringify({
            totalECTS: 180,
            completedECTS: 90,
            hoursPerECTS: 27.5,
          }));
        } else {
          setStudyProgram(parsed);
        }
      }
      // Show past sessions review dialog after onboarding
      setShowPastSessionsReview(true);
    }
  }, []);

  const handleOnboardingComplete = (program: StudyProgram) => {
    setStudyProgram(program);
    localStorage.setItem('hasOnboarded', 'true');
    localStorage.setItem('studyProgram', JSON.stringify(program));
    setShowOnboarding(false);
    setShowPastSessionsReview(true);
  };

  // Course management state - Based on provided study plan
  const [courses, setCourses] = useState<Course[]>([
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
  ]);

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


  // Generate scheduled sessions for the next 2 weeks
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>(generateMockSessions());

  // Dialog states
  const [showCourseDialog, setShowCourseDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | undefined>();
  const [editingBlock, setEditingBlock] = useState<StudyBlock | undefined>();
  const [editingSession, setEditingSession] = useState<ScheduledSession | undefined>();
  const [feedbackSession, setFeedbackSession] = useState<ScheduledSession | null>(null);
  const [originalSessionBeforeMove, setOriginalSessionBeforeMove] = useState<ScheduledSession | null>(null);

  // Calculate weekly capacity
  const weeklyCapacity = calculateWeeklyAvailableMinutes(studyBlocks);

  // Get past sessions that need evaluation
  const getPastUnevaluatedSessions = (): ScheduledSession[] => {
    const now = new Date();
    
    return scheduledSessions.filter(session => {
      // Check if session has ended (comparing end time) in local timezone
      const [year, month, day] = session.date.split('-').map(Number);
      const [endHour, endMinute] = session.endTime.split(':').map(Number);
      const sessionEndDate = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
      
      return sessionEndDate < now && !session.completed;
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
  }) => {
    // Update the session
    setScheduledSessions(prev => prev.map(session => 
      session.id === feedback.sessionId 
        ? { 
            ...session, 
            completed: feedback.completed,
            completionPercentage: feedback.selfAssessmentProgress 
          } 
        : session
    ));

    // Update course progress and milestones
    setCourses(prevCourses => {
      return prevCourses.map(course => {
        if (feedbackSession && course.id === feedbackSession.courseId) {
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

  const handleSaveCourse = (courseData: Omit<Course, 'id' | 'progress' | 'completedHours' | 'createdAt'>) => {
    if (editingCourse) {
      // Update existing course
      setCourses(prev => prev.map(c => 
        c.id === editingCourse.id 
          ? { 
              ...editingCourse, 
              ...courseData,
              // Recalculate estimated end date based on remaining hours and weekly capacity
              estimatedEndDate: calculateEstimatedEndDate(
                courseData.estimatedHours - editingCourse.completedHours,
                weeklyCapacity
              )
            }
          : c
      ));
    } else {
      // Create new course
      const newCourse: Course = {
        id: `course-${Date.now()}`,
        ...courseData,
        progress: 0,
        completedHours: 0,
        createdAt: new Date().toISOString(),
        estimatedEndDate: calculateEstimatedEndDate(courseData.estimatedHours, weeklyCapacity),
      };
      setCourses(prev => [...prev, newCourse]);
      
      // Automatically generate schedule when course is added
      generateSchedule([newCourse], studyBlocks);
    }
    
    setEditingCourse(undefined);
  };

  const handleDeleteCourse = (courseId: string) => {
    if (confirm('Möchtest du diesen Kurs wirklich löschen?')) {
      setCourses(prev => prev.filter(c => c.id !== courseId));
    }
  };

  const handleCompleteCourse = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    
    if (confirm(`Möchtest du den Kurs "${course.name}" wirklich abschließen? Die ECTS-Punkte werden deinem Studienfortschritt hinzugefügt.`)) {
      // Mark course as completed
      setCourses(prev => prev.map(c => 
        c.id === courseId 
          ? { ...c, status: 'completed' as const, progress: 100, completedHours: c.estimatedHours }
          : c
      ));
      
      // Add ECTS to study program
      setStudyProgram(prev => {
        const updated = {
          ...prev,
          completedECTS: prev.completedECTS + course.ects
        };
        localStorage.setItem('studyProgram', JSON.stringify(updated));
        return updated;
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
    // Check if session has ended (comparing end time) in local timezone
    const [year, month, day] = session.date.split('-').map(Number);
    const [endHour, endMinute] = session.endTime.split(':').map(Number);
    const sessionEndDate = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
    const now = new Date();
    
    if (sessionEndDate < now && !session.completed) {
      // Past session - first ask if attended
      setFeedbackSession(session);
      setShowAttendanceDialog(true);
    } else {
      // Future or completed session - show edit dialog
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

  const handleSessionNotAttended = () => {
    // User didn't attend - mark session as completed (grayed out) with 0%
    if (!feedbackSession) return;
    
    const course = courses.find(c => c.id === feedbackSession.courseId);
    if (!course) return;

    // Update session to completed with 0 hours
    setScheduledSessions(prev => prev.map(s => 
      s.id === feedbackSession.id 
        ? { ...s, completed: true, completionPercentage: 0 }
        : s
    ));

    // Add scheduled hours back to open hours
    const sessionHours = feedbackSession.durationMinutes / 60;
    setCourses(prev => prev.map(c => 
      c.id === feedbackSession.courseId 
        ? { ...c, scheduledHours: Math.max(0, c.scheduledHours - sessionHours) }
        : c
    ));

    setShowAttendanceDialog(false);
    setFeedbackSession(null);
  };

  const handleSaveSession = (sessionData: Omit<ScheduledSession, 'id'>, recurring?: { enabled: boolean }) => {
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
    
    if (editingSession) {
      const updatedSession = { ...editingSession, ...sessionData, lastModified: Date.now() };
      console.log('✏️ Updated existing session:', updatedSession);
      setScheduledSessions(prev => prev.map(s => 
        s.id === editingSession.id ? updatedSession : s
      ));
    } else {
      const newSession: ScheduledSession = {
        id: `session-${Date.now()}`,
        ...sessionData,
        lastModified: Date.now(),
      };
      console.log('✨ Created new session:', newSession);
      
      // If recurring is enabled, create multiple sessions
      if (recurring?.enabled) {
        const course = courses.find(c => c.id === sessionData.courseId);
        if (course) {
          const remainingHours = course.estimatedHours - course.completedHours - course.scheduledHours;
          const sessionHours = sessionData.durationMinutes / 60;
          const sessionsNeeded = Math.ceil(remainingHours / sessionHours);
          
          const sessions: ScheduledSession[] = [];
          const startDate = new Date(sessionData.date);
          
          for (let i = 0; i < sessionsNeeded && i < 20; i++) { // Max 20 sessions
            const sessionDate = new Date(startDate);
            sessionDate.setDate(startDate.getDate() + (i * 7)); // Weekly recurring
            
            // Format date to local YYYY-MM-DD without UTC conversion
            const year = sessionDate.getFullYear();
            const month = String(sessionDate.getMonth() + 1).padStart(2, '0');
            const day = String(sessionDate.getDate()).padStart(2, '0');
            const localDateStr = `${year}-${month}-${day}`;
            
            // Calculate endDate if original session spans multiple days
            let localEndDateStr = undefined;
            if (sessionData.endDate && sessionData.endDate !== sessionData.date) {
              const daysDiff = Math.floor((new Date(sessionData.endDate).getTime() - new Date(sessionData.date).getTime()) / (1000 * 60 * 60 * 24));
              const sessionEndDate = new Date(sessionDate);
              sessionEndDate.setDate(sessionEndDate.getDate() + daysDiff);
              const endYear = sessionEndDate.getFullYear();
              const endMonth = String(sessionEndDate.getMonth() + 1).padStart(2, '0');
              const endDay = String(sessionEndDate.getDate()).padStart(2, '0');
              localEndDateStr = `${endYear}-${endMonth}-${endDay}`;
            }
            
            sessions.push({
              ...sessionData,
              id: `session-${Date.now()}-${i}`,
              date: localDateStr,
              endDate: localEndDateStr,
              lastModified: Date.now(),
            });
          }
          
          setScheduledSessions(prev => [...prev, ...sessions]);
          
          // Update scheduled hours for the course
          setCourses(prev => prev.map(c => 
            c.id === sessionData.courseId 
              ? { ...c, scheduledHours: c.scheduledHours + (sessions.length * sessionHours) }
              : c
          ));
        }
      } else {
        setScheduledSessions(prev => [...prev, newSession]);
        
        // Update scheduled hours for single session
        const sessionHours = sessionData.durationMinutes / 60;
        setCourses(prev => prev.map(c => 
          c.id === sessionData.courseId 
            ? { ...c, scheduledHours: c.scheduledHours + sessionHours }
            : c
        ));
      }
    }
    
    // Automatically activate course if it's still planned
    const selectedCourse = courses.find(c => c.id === sessionData.courseId);
    if (selectedCourse && selectedCourse.status === 'planned') {
      console.log('🎯 Activating planned course:', selectedCourse.name);
      setCourses(prev => prev.map(c => 
        c.id === sessionData.courseId 
          ? { ...c, status: 'active' as const }
          : c
      ));
    }
    
    // Clear state and close dialog
    setOriginalSessionBeforeMove(null);
    setEditingSession(undefined);
    setShowSessionDialog(false);
    
    // Trigger auto-sync
    setAutoSyncTrigger(Date.now());
  };

  const handleDeleteSession = (sessionId: string) => {
    setScheduledSessions(prev => prev.filter(s => s.id !== sessionId));
    // Clear state and close dialog
    setOriginalSessionBeforeMove(null);
    setEditingSession(undefined);
    setShowSessionDialog(false);
    
    // Trigger auto-sync
    setAutoSyncTrigger(Date.now());
  };

  // Handle sessions imported from Google Calendar
  const handleSessionsImported = (importedSessions: ScheduledSession[]) => {
    console.log('📥 Importing sessions from Google Calendar:', importedSessions.length);
    
    // Replace all sessions with the merged ones from the sync
    // The sync already performed the merge based on lastModified timestamps
    setScheduledSessions(importedSessions);
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

  return (
    <div className="h-screen lg:overflow-hidden bg-gray-50 flex flex-col">
      {/* App Header - Desktop */}
      <header className="hidden lg:block bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-gray-900 text-2xl">Intelligent Study Planner</h1>
            
            {/* Desktop Navigation */}
            <nav className="flex items-center gap-2">
              <Button
                variant={currentView === 'dashboard' ? 'default' : 'ghost'}
                onClick={() => setCurrentView('dashboard')}
              >
                Start
              </Button>
              <Button
                variant={currentView === 'courses' ? 'default' : 'ghost'}
                onClick={() => setCurrentView('courses')}
              >
                Kurse
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
        onSubmit={handleSessionFeedback}
        skipAttendanceQuestion={true}
      />

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
      />
      
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
