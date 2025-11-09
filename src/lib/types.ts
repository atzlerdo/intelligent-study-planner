// Core data types for the study planning application

export interface Course {
  id: string;
  name: string;
  type: 'written-exam' | 'project';
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
  courseId: string;
  studyBlockId: string;
  date: string;
  startTime: string;
  endDate?: string; // Optional: for sessions spanning multiple days
  endTime: string;
  durationMinutes: number;
  completed: boolean;
  completionPercentage: number;
  notes?: string;
  lastModified?: number; // Unix ms timestamp for merge logic
}

export interface Session {
  id: string;
  courseId: string;
  date: string;
  completed: boolean;
  completionPercentage?: number;
}
