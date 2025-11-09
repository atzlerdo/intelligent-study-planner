import type { ScheduledSession } from '../types';

/**
 * Generates mock scheduled sessions for the next 2 weeks
 * Sessions vary between 1 and 8 hours across different days
 */
export function generateMockSessions(): ScheduledSession[] {
  const today = new Date();
  const sessions: ScheduledSession[] = [];
  
  // Helper to get date string
  const getDateString = (daysOffset: number): string => {
    const date = new Date(today);
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  };

  // Active course: 'course-2-6' (Project: Java and Web Development)
  // Sessions for active course including some past sessions
  
  const sessionData = [
    // Past sessions (not evaluated yet)
    { courseId: 'course-2-6', hours: 3, startTime: '18:00', endTime: '21:00', day: -5 },
    { courseId: 'course-2-6', hours: 2.5, startTime: '18:00', endTime: '20:30', day: -3 },
    
    // Today + 1 (Tomorrow)
    { courseId: 'course-2-6', hours: 3, startTime: '18:00', endTime: '21:00', day: 1 },
    
    // Today + 3
    { courseId: 'course-2-6', hours: 4, startTime: '15:00', endTime: '19:00', day: 3 },
    
    // Today + 6 (Weekend)
    { courseId: 'course-2-6', hours: 5, startTime: '10:00', endTime: '15:00', day: 6 },
    
    // Week 2
    { courseId: 'course-2-6', hours: 3, startTime: '18:00', endTime: '21:00', day: 8 },
    { courseId: 'course-2-6', hours: 2.5, startTime: '18:00', endTime: '20:30', day: 10 },
    
    // Weekend week 2
    { courseId: 'course-2-6', hours: 4, startTime: '10:00', endTime: '14:00', day: 13 },
  ];

  sessionData.forEach((session, index) => {
    sessions.push({
      id: `session-${index + 1}`,
      courseId: session.courseId,
      studyBlockId: 'block-auto',
      date: getDateString(session.day),
      startTime: session.startTime,
      endTime: session.endTime,
      durationMinutes: session.hours * 60,
      completed: false,
      completionPercentage: 0,
    });
  });

  return sessions;
}
