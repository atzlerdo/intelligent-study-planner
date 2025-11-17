/**
 * ============================================================================
 * SCHEDULER - Auto-scheduling and Time Calculation Utilities
 * ============================================================================
 * 
 * Provides algorithms for:
 * - Automatic session scheduling (distribute course hours across study blocks)
 * - Weekly time availability calculation
 * - Estimated completion date projection
 * - Duration calculation (handles same-day, overnight, and multi-day sessions)
 * 
 * Core Algorithm (generateSchedule):
 * - Round-robin distribution: cycles through courses and study blocks
 * - Respects available time: only schedules up to remaining course hours
 * - 16-week planning horizon: one semester ahead
 * - Skips past dates: only creates future sessions
 * 
 * Use Cases:
 * - User clicks "Auto-Schedule" button in UI
 * - Estimated end date calculation for course cards
 * - Weekly capacity validation (can user finish courses in time?)
 */

import type { Course, StudyBlock, ScheduledSession } from '../types';

/**
 * Calculate total study time available per week
 * 
 * Sums up duration of all active study blocks. Used to determine
 * if user has enough weekly capacity to complete courses on time.
 * 
 * @param blocks All study blocks (inactive ones are filtered out)
 * @returns Total minutes available per week
 * 
 * @example
 * // User has 3 study blocks: Mon 2h, Wed 3h, Fri 2h = 420 minutes/week
 * calculateWeeklyAvailableMinutes(blocks) // => 420
 */
export function calculateWeeklyAvailableMinutes(blocks: StudyBlock[]): number {
  return blocks
    .filter(block => block.isActive)
    .reduce((sum, block) => sum + block.durationMinutes, 0);
}

/**
 * Automatically schedule course workload across available study blocks
 * 
 * ALGORITHM:
 * 1. Filter courses with remaining hours (not yet completed)
 * 2. Sort study blocks by day/time for consistent scheduling
 * 3. Use round-robin approach: cycle through courses and blocks
 * 4. Schedule sessions up to 16 weeks (one semester)
 * 5. Skip dates in the past
 * 
 * DISTRIBUTION STRATEGY:
 * - Fair allocation: each course gets time before cycling back
 * - Block constraints: session duration ≤ study block duration
 * - Remaining time: stops when course hours are exhausted
 * 
 * LIMITATIONS:
 * - Does NOT consider exam deadlines or priorities
 * - Simple round-robin (no advanced optimization)
 * - Fixed 16-week horizon
 * 
 * @param courses All courses (filtered to those with remaining time)
 * @param studyBlocks Recurring weekly time slots
 * @param startDate When to start scheduling (defaults to today)
 * @returns Array of scheduled sessions (not yet saved to backend)
 * 
 * @example
 * // Auto-schedule 3 courses across 5 weekly study blocks for next semester
 * const sessions = generateSchedule(courses, studyBlocks, new Date());
 */
export function generateSchedule(
  courses: Course[],
  studyBlocks: StudyBlock[],
  startDate: Date = new Date()
): ScheduledSession[] {
  const sessions: ScheduledSession[] = [];
  
  // Sort study blocks by day of week, then by start time for consistent scheduling
  const activeBlocks = studyBlocks.filter(b => b.isActive).sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  // Guard: No active study blocks means no scheduling possible
  if (activeBlocks.length === 0) return sessions;

  // Filter courses that still have hours remaining to schedule
  const coursesWithRemainingTime = courses.filter(
    c => c.completedHours < c.estimatedHours
  );

  // Convert remaining hours to minutes for each course
  const courseMinutes = coursesWithRemainingTime.map(course => ({
    course,
    minutesRemaining: (course.estimatedHours - course.completedHours) * 60,
  }));

  // Start from beginning of start date (midnight)
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);

  // Tracking indices for round-robin distribution
  let blockIndex = 0;      // Current study block
  let courseIndex = 0;     // Current course
  let sessionCounter = 0;  // Session ID counter

  // Planning horizon: 16 weeks = 1 semester
  const weeksToSchedule = 16;
  const endDate = new Date(currentDate);
  endDate.setDate(endDate.getDate() + weeksToSchedule * 7);

  // Main scheduling loop: continue until end date or all courses scheduled
  while (currentDate <= endDate && courseMinutes.some(cm => cm.minutesRemaining > 0)) {
    const block = activeBlocks[blockIndex % activeBlocks.length];
    
    // Calculate next occurrence of this study block's day
    const daysUntilBlock = (block.dayOfWeek - currentDate.getDay() + 7) % 7;
    const sessionDate = new Date(currentDate);
    sessionDate.setDate(currentDate.getDate() + daysUntilBlock);

    // Only schedule future sessions (skip past dates)
    if (sessionDate >= startDate) {
      // Round-robin: try to assign a course to this time slot
      let attempts = 0;
      while (attempts < courseMinutes.length) {
        const currentCourse = courseMinutes[courseIndex % courseMinutes.length];
        
        if (currentCourse.minutesRemaining > 0) {
          // Schedule up to block duration or remaining course time (whichever is smaller)
          const minutesToSchedule = Math.min(
            block.durationMinutes,
            currentCourse.minutesRemaining
          );

          // Create scheduled session
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

          // Deduct scheduled time from course's remaining time
          currentCourse.minutesRemaining -= minutesToSchedule;
          break;
        }
        
        courseIndex++;
        attempts++;
      }

      courseIndex++;
    }

    blockIndex++;
    
    // After cycling through all blocks, move to next day
    if (blockIndex % activeBlocks.length === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return sessions;
}

/**
 * ============================================================================
 * DATE & TIME CALCULATIONS
 * ============================================================================
 */

/**
 * Calculate estimated completion date for a course
 * 
 * Projects when a course will be finished based on:
 * - Remaining hours to complete
 * - Weekly time capacity (sum of active study blocks)
 * - Start date (when to begin counting)
 * 
 * Formula: weeks_needed = remaining_minutes / weekly_capacity_minutes
 * 
 * @param remainingHours Hours left to complete (estimatedHours - completedHours)
 * @param weeklyCapacityMinutes Total study time available per week
 * @param startDate When to start counting (defaults to today)
 * @returns ISO date string (YYYY-MM-DD)
 * 
 * @example
 * // Course has 30 hours remaining, user studies 10 hours/week
 * calculateEstimatedEndDate(30, 600, new Date()) // => 3 weeks from today
 */
export function calculateEstimatedEndDate(
  remainingHours: number,
  weeklyCapacityMinutes: number,
  startDate: Date = new Date()
): string {
  if (weeklyCapacityMinutes === 0) {
    // Fallback: assume 3 months if no study blocks defined
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
 * Convert time string to minutes since midnight
 * 
 * Helper for time calculations and comparisons.
 * 
 * @param time Time in HH:mm format (24-hour)
 * @returns Minutes since 00:00 (0-1439)
 * 
 * @example
 * timeToMinutes("14:30") // => 870 (14*60 + 30)
 * timeToMinutes("00:00") // => 0
 * timeToMinutes("23:59") // => 1439
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculate session duration in minutes
 * 
 * Handles three scenarios:
 * 1. Same-day session: 14:00-16:00 = 120 minutes
 * 2. Overnight session: 23:00-01:00 = 120 minutes (crosses midnight)
 * 3. Multi-day session: Mon 20:00 to Wed 10:00 = full days + partial hours
 * 
 * Multi-day support added for marathon study sessions or long work blocks.
 * 
 * @param startTime Start time in HH:mm format
 * @param endTime End time in HH:mm format
 * @param startDate Optional start date (YYYY-MM-DD) for multi-day sessions
 * @param endDate Optional end date (YYYY-MM-DD) for multi-day sessions
 * @returns Duration in minutes
 * 
 * @example
 * // Same day
 * calculateDuration("14:00", "16:00") // => 120
 * 
 * // Over midnight
 * calculateDuration("23:00", "01:00") // => 120
 * 
 * // Multi-day (Mon 20:00 to Tue 10:00)
 * calculateDuration("20:00", "10:00", "2025-11-17", "2025-11-18") // => 840
 */
export function calculateDuration(
  startTime: string, 
  endTime: string, 
  startDate?: string, 
  endDate?: string
): number {
  // Legacy mode: no dates provided (assume same day or overnight)
  if (!startDate || !endDate) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    // If end >= start: same day session
    // If end < start: session crosses midnight (e.g., 23:00-01:00)
    return end >= start ? end - start : (24 * 60 - start) + end;
  }
  
  // Multi-day mode: use actual date/time objects for precise calculation
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  // Construct full datetime objects
  const startDateTime = new Date(startDate);
  startDateTime.setHours(startHour, startMin, 0, 0);
  
  const endDateTime = new Date(endDate);
  endDateTime.setHours(endHour, endMin, 0, 0);
  
  // Calculate difference in milliseconds, then convert to minutes
  const diffMs = endDateTime.getTime() - startDateTime.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60)));
}
