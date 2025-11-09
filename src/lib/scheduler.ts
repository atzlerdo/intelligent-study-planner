import type { Course, StudyBlock, ScheduledSession } from '../types';

/**
 * Calculates the total available study time per week from study blocks
 */
export function calculateWeeklyAvailableMinutes(blocks: StudyBlock[]): number {
  return blocks
    .filter(block => block.isActive)
    .reduce((sum, block) => sum + block.durationMinutes, 0);
}

/**
 * Automatically schedules course workload into available study blocks
 */
export function generateSchedule(
  courses: Course[],
  studyBlocks: StudyBlock[],
  startDate: Date = new Date()
): ScheduledSession[] {
  const sessions: ScheduledSession[] = [];
  const activeBlocks = studyBlocks.filter(b => b.isActive).sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  if (activeBlocks.length === 0) return sessions;

  // Get courses that still need time scheduled
  const coursesWithRemainingTime = courses.filter(
    c => c.completedHours < c.estimatedHours
  );

  // Calculate total minutes needed per course
  const courseMinutes = coursesWithRemainingTime.map(course => ({
    course,
    minutesRemaining: (course.estimatedHours - course.completedHours) * 60,
  }));

  let currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);

  // Distribute workload across available blocks
  let blockIndex = 0;
  let courseIndex = 0;
  let sessionCounter = 0;

  // Schedule for the next 16 weeks (one semester)
  const weeksToSchedule = 16;
  const endDate = new Date(currentDate);
  endDate.setDate(endDate.getDate() + weeksToSchedule * 7);

  while (currentDate <= endDate && courseMinutes.some(cm => cm.minutesRemaining > 0)) {
    const block = activeBlocks[blockIndex % activeBlocks.length];
    
    // Find the next occurrence of this day of week
    const daysUntilBlock = (block.dayOfWeek - currentDate.getDay() + 7) % 7;
    const sessionDate = new Date(currentDate);
    sessionDate.setDate(currentDate.getDate() + daysUntilBlock);

    // Skip if the date is in the past
    if (sessionDate >= startDate) {
      // Round-robin course assignment
      let attempts = 0;
      while (attempts < courseMinutes.length) {
        const currentCourse = courseMinutes[courseIndex % courseMinutes.length];
        
        if (currentCourse.minutesRemaining > 0) {
          const minutesToSchedule = Math.min(
            block.durationMinutes,
            currentCourse.minutesRemaining
          );

          sessions.push({
            id: `session-${sessionCounter++}`,
            courseId: currentCourse.course.id,
            studyBlockId: block.id,
            date: sessionDate.toISOString().split('T')[0],
            startTime: block.startTime,
            endTime: block.endTime,
            durationMinutes: minutesToSchedule,
            completed: false,
            completionPercentage: 0,
          });

          currentCourse.minutesRemaining -= minutesToSchedule;
          break;
        }
        
        courseIndex++;
        attempts++;
      }

      courseIndex++;
    }

    blockIndex++;
    
    // Move to next day after going through all blocks
    if (blockIndex % activeBlocks.length === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return sessions;
}

/**
 * Calculates estimated end date based on remaining hours and weekly capacity
 */
export function calculateEstimatedEndDate(
  remainingHours: number,
  weeklyCapacityMinutes: number,
  startDate: Date = new Date()
): string {
  if (weeklyCapacityMinutes === 0) {
    // Default to 3 months if no capacity defined
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 3);
    return endDate.toISOString().split('T')[0];
  }

  const remainingMinutes = remainingHours * 60;
  const weeksNeeded = Math.ceil(remainingMinutes / weeklyCapacityMinutes);
  
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + weeksNeeded * 7);
  
  return endDate.toISOString().split('T')[0];
}

/**
 * Parses time string (HH:mm) to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculates duration between two times in minutes
 * Supports multi-day sessions via startDate and endDate
 */
export function calculateDuration(
  startTime: string, 
  endTime: string, 
  startDate?: string, 
  endDate?: string
): number {
  // If no dates provided, use old logic (same day or over midnight)
  if (!startDate || !endDate) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    return end >= start ? end - start : (24 * 60 - start) + end;
  }
  
  // Multi-day calculation
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startDateTime = new Date(startDate);
  startDateTime.setHours(startHour, startMin, 0, 0);
  
  const endDateTime = new Date(endDate);
  endDateTime.setHours(endHour, endMin, 0, 0);
  
  const diffMs = endDateTime.getTime() - startDateTime.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60))); // Convert to minutes
}
