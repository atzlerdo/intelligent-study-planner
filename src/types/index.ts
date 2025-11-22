// Core data types for the study planning application

export interface Course {
  id: string;
  name: string;
  type: 'written-exam' | 'oral-exam' | 'project' | 'assignment' | 'online-exam' | 'presentation';
  ects: number; // ECTS credits for this course
  estimatedHours: number;
  completedHours: number;
  scheduledHours: number; // Hours that have been scheduled in blocks
  progress: number;
  status: 'planned' | 'active' | 'completed';
  estimatedEndDate: string;
  examDate?: string; // Date when exam-ready or project deadline for active courses
  milestones: Milestone[];
  createdAt: string;
  semester?: number; // Semester number (1-6 for Bachelor)
  updatedAt?: string; // Optional timestamp from backend updates
}

export interface StudyProgram {
  totalECTS: number; // 180 or 210
  completedECTS: number; // ECTS already achieved
  hoursPerECTS: number; // Default: 25-30 hours per ECTS
}

export interface Milestone {
  id: string;
  title: string;
  deadline: string;
  completed: boolean;
}

export interface StudyBlock {
  id: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  durationMinutes: number;
  isActive: boolean;
}

export interface ScheduledSession {
  id: string;
  courseId?: string; // Optional: undefined for unassigned sessions (blockers)
  studyBlockId?: string; // Optional for sessions created via direct dialog input
  date: string;
  startTime: string;
  endDate?: string; // Optional: for sessions spanning multiple days
  endTime: string;
  durationMinutes: number;
  completed: boolean;
  completionPercentage: number;
  notes?: string;
  lastModified?: number; // Unix ms timestamp for merge logic
  googleEventId?: string; // Link to Google Calendar event
  googleCalendarId?: string; // Which calendar this event is in
  originalTitle?: string; // Original title from Google Calendar (stored but not displayed for unassigned)
  originalDescription?: string; // Original description from Google Calendar (stored but not displayed for unassigned)
  
  // Recurrence pattern (optional - makes this a recurring session)
  recurrence?: {
    rrule: string; // RFC 5545 RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
    dtstart: string; // ISO date string for series start
    until?: string; // ISO date string for series end (optional)
    exdates?: string[]; // Excluded dates (ISO date strings)
    count?: number; // Max number of occurrences
  };
  
  // For instances of recurring sessions
  recurringEventId?: string; // If this session is an instance of a recurring pattern (references the master session ID)
  isRecurrenceException?: boolean; // If this instance has been modified from the pattern
}

// Recurring event series stored separately to avoid expanding all instances
export interface RecurringEventSeries {
  id: string; // Master event ID from Google Calendar
  courseId?: string;
  rrule: string; // RFC 5545 RRULE string
  startTime: string; // HH:mm format for the pattern
  endTime: string; // HH:mm format for the pattern
  durationMinutes: number;
  dtstart: string; // ISO date string for series start
  until?: string; // ISO date string for series end (optional)
  exdates: string[]; // Dates to exclude (ISO date strings)
  overrides: Record<string, RecurrenceOverride>; // Date-specific overrides keyed by ISO date
  googleCalendarId?: string;
  originalTitle?: string;
  originalDescription?: string;
  lastModified?: number;
}

export interface RecurrenceOverride {
  date: string; // ISO date string
  startTime?: string; // If time changed
  endTime?: string;
  durationMinutes?: number;
  cancelled?: boolean; // If this instance was cancelled
  notes?: string;
  completed?: boolean;
  completionPercentage?: number;
}

// Google Calendar sync statistics
export interface SyncStats {
  lastSyncTime?: number; // Unix timestamp
  lastSyncSuccess: boolean;
  lastSyncError?: string;
  totalSynced: number;
  created: number;
  updated: number;
  skipped: number; // Unchanged items
  deleted: number;
  recurring: number; // Recurring series processed
}

export interface Session {
  id: string;
  courseId: string;
  date: string;
  completed: boolean;
  completionPercentage?: number;
}
