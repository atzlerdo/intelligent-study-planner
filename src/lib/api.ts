/**
 * API Client for Backend Communication
 * 
 * This module handles all HTTP communication with the backend server.
 * It manages authentication tokens, makes API requests, and handles errors.
 */

// Base URL for all API requests - uses environment variable or defaults to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================================
// Authentication Token Management
// ============================================================================
// Store JWT authentication token in memory (loaded from localStorage on init)
let authToken: string | null = localStorage.getItem('authToken');

/**
 * Set or clear the authentication token
 * Persists to localStorage for session recovery after page reload
 */
export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
}

/**
 * Get the current authentication token
 */
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Check if user is currently authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
  return !!authToken;
}

/**
 * Custom error class for API-specific errors
 * Includes HTTP status code and detailed error information
 */
export class ApiError extends Error {
  details?: unknown;
  status?: number;
  constructor(message: string, details?: unknown, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
    this.status = status;
  }
}

// ============================================================================
// Generic Fetch Wrapper
// ============================================================================
/**
 * Generic HTTP request wrapper with authentication and error handling
 * 
 * @param endpoint - API endpoint path (e.g., '/auth/login')
 * @param options - Fetch options (method, body, etc.)
 * @returns Parsed JSON response
 * @throws ApiError if request fails
 */
async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Set up headers with JSON content type
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add authentication token to header if available
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // Make the HTTP request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle errors by parsing response and throwing ApiError
  if (!response.ok) {
    let payload: { error?: string; details?: unknown } = { error: 'Request failed' };
    try {
      payload = await response.json();
    } catch {/* ignore parse errors */}
    const message = payload.error || `HTTP ${response.status}`;
    throw new ApiError(message, payload.details, response.status);
  }

  // Return parsed JSON response
  return response.json();
}

// ============================================================================
// Authentication API
// ============================================================================

/** User registration data */
export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

/** User login credentials */
export interface LoginData {
  email: string;
  password: string;
}

/** Authentication response from server (includes JWT token and user info) */
export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Register a new user account
 * Automatically stores the returned auth token
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await fetchAPI<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setAuthToken(response.token);
  return response;
}

/**
 * Login with email and password
 * Automatically stores the returned auth token
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await fetchAPI<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setAuthToken(response.token);
  return response;
}

/**
 * Logout current user
 * Clears authentication token and Google Calendar cache to prevent data leakage
 */
export function logout() {
  // Clear authentication token
  setAuthToken(null);
  
  // Clear Google Calendar cache keys to prevent data leakage between users
  // This ensures the next user won't see previous user's calendar data
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('googleCalendar')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.error('Failed to clear Google Calendar cache:', e);
  }
}

// ============================================================================
// Courses API
// ============================================================================

/** Course entity with all fields */
export interface Course {
  id: string;
  name: string;
  type: 'written-exam' | 'project';
  ects: number;
  estimatedHours: number;
  completedHours: number;
  scheduledHours: number;
  progress: number;
  status: 'planned' | 'active' | 'completed';
  estimatedEndDate: string;
  examDate?: string;
  semester?: number;
  createdAt: string;
  updatedAt?: string;
  milestones: Array<{
    id: string;
    title: string;
    deadline: string;
    completed: boolean;
  }>;
}

/** Data required to create a new course */
export interface CreateCourseData {
  name: string;
  type: 'written-exam' | 'project';
  ects: number;
  estimatedHours: number;
  estimatedEndDate: string;
  examDate?: string;
  semester?: number;
}

/**
 * Fetch all courses for the current user
 * Maps server's snake_case fields to frontend's camelCase
 */
export async function getCourses(): Promise<Course[]> {
  const raw = await fetchAPI<Array<Record<string, unknown>>>('/courses');
  // Map snake_case from server to camelCase expected by frontend
  return raw.map((c): Course => ({
    id: c.id as string,
    name: c.name as string,
    type: c.type as 'project' | 'written-exam',
    ects: c.ects as number,
    estimatedHours: (c.estimated_hours ?? c.estimatedHours) as number,
    completedHours: (c.completed_hours ?? c.completedHours ?? 0) as number,
    scheduledHours: (c.scheduled_hours ?? c.scheduledHours ?? 0) as number,
    progress: (c.progress ?? 0) as number,
    status: c.status as 'planned' | 'active' | 'completed',
    estimatedEndDate: (c.estimated_end_date ?? c.estimatedEndDate) as string,
    examDate: (c.exam_date ?? c.examDate) as string | undefined,
    semester: c.semester as number | undefined,
    createdAt: (c.created_at ?? c.createdAt) as string,
    updatedAt: c.updated_at ? String(c.updated_at) : (c.updatedAt ? String(c.updatedAt) : undefined),
    milestones: ((c.milestones || []) as Array<Record<string, unknown>>).map((m) => ({
      id: m.id as string,
      title: m.title as string,
      deadline: m.deadline as string,
      completed: !!m.completed,
    })),
  }));
}

export async function getCourse(id: string): Promise<Course> {
  return fetchAPI<Course>(`/courses/${id}`);
}

export async function createCourse(data: CreateCourseData): Promise<Course> {
  return fetchAPI<Course>('/courses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCourse(id: string, data: Partial<CreateCourseData>): Promise<Course> {
  return fetchAPI<Course>(`/courses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Extended update (migration) allowing status/progress/hours fields
export interface ExtendedCourseUpdate extends Partial<CreateCourseData> {
  completedHours?: number;
  scheduledHours?: number;
  progress?: number;
  status?: 'planned' | 'active' | 'completed';
}

export async function updateCourseExtended(id: string, data: ExtendedCourseUpdate): Promise<Course> {
  return fetchAPI<Course>(`/courses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCourse(id: string): Promise<void> {
  await fetchAPI<void>(`/courses/${id}`, {
    method: 'DELETE',
  });
}

// Sessions API
export interface Session {
  id: string;
  courseId?: string;
  studyBlockId?: string;
  date: string;
  startTime: string;
  endDate?: string;
  endTime: string;
  durationMinutes: number;
  completed: boolean;
  completionPercentage: number;
  notes?: string;
  lastModified?: number;
  googleEventId?: string;
  googleCalendarId?: string;
  recurringEventId?: string;
  isRecurrenceException?: boolean;
  recurrence?: {
    rrule: string;
    dtstart: string;
    until?: string;
    count?: number;
    exdates?: string[];
  };
}

export interface CreateSessionData {
  courseId?: string;
  studyBlockId?: string;
  date: string;
  startTime: string;
  endDate?: string;
  endTime: string;
  durationMinutes: number;
  notes?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  recurrence?: {
    rrule: string;
    dtstart: string;
    until?: string;
    count?: number;
    exdates?: string[];
  };
}

export async function getSessions(): Promise<Session[]> {
  const raw = await fetchAPI<Array<Record<string, unknown>>>('/sessions');
  return raw.map((s): Session => {
    const rec = s.recurrence as Record<string, unknown> | undefined;
    return {
      id: s.id as string,
      courseId: (s.course_id ?? s.courseId) as string | undefined,
      studyBlockId: (s.study_block_id ?? s.studyBlockId) as string | undefined,
      date: s.date as string,
      startTime: (s.start_time ?? s.startTime) as string,
      endDate: (s.end_date ?? s.endDate) as string | undefined,
      endTime: (s.end_time ?? s.endTime) as string,
      durationMinutes: (s.duration_minutes ?? s.durationMinutes) as number,
      completed: !!(s.completed),
      completionPercentage: (s.completion_percentage ?? s.completionPercentage ?? 0) as number,
      notes: s.notes as string | undefined,
      lastModified: (s.last_modified ?? s.lastModified) as number | undefined,
      googleEventId: (s.google_event_id ?? s.googleEventId) as string | undefined,
      googleCalendarId: (s.google_calendar_id ?? s.googleCalendarId) as string | undefined,
      recurringEventId: (s.recurring_event_id ?? s.recurringEventId) as string | undefined,
      isRecurrenceException: (s.isRecurrenceException ?? (!!(s.is_recurrence_exception))) as boolean | undefined,
      recurrence: rec
        ? {
            rrule: rec.rrule as string,
            dtstart: rec.dtstart as string,
            until: rec.until as string | undefined,
            count: rec.count as number | undefined,
            exdates: (rec.exdates ?? []) as string[],
          }
        : undefined,
    };
  });
}

export async function createSession(data: CreateSessionData): Promise<Session> {
  return fetchAPI<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSession(id: string, data: Partial<CreateSessionData> & { completed?: boolean; completionPercentage?: number }): Promise<Session> {
  return fetchAPI<Session>(`/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await fetchAPI<void>(`/sessions/${id}`, {
    method: 'DELETE',
  });
}

// Force-migrate legacy data into backend for the current authenticated user (idempotent-ish)
// (Removed migrateLegacyDataForce – force migration UI deprecated)

// Data migration helper: push legacy local courses & sessions if backend is empty
export async function migrateIfEmpty(legacy: {
  courses: Array<{
    id: string;
    name: string;
    type: 'written-exam' | 'project';
    ects: number;
    estimatedHours: number;
    completedHours: number;
    scheduledHours: number;
    progress: number;
    status: 'planned' | 'active' | 'completed';
    estimatedEndDate: string;
    examDate?: string;
    semester?: number;
    milestones: Array<{ id: string; title: string; deadline: string; completed: boolean }>;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    courseId?: string;
    studyBlockId?: string;
    date: string;
    startTime: string;
    endDate?: string;
    endTime: string;
    durationMinutes: number;
    completed: boolean;
    completionPercentage: number;
    notes?: string;
  }>;
}): Promise<{ migrated: boolean; courses: Course[]; sessions: Session[] }> {
  const existingCourses = await getCourses();
  const existingSessions = await getSessions();
  if (existingCourses.length > 0 || existingSessions.length > 0) {
    return { migrated: false, courses: existingCourses, sessions: existingSessions };
  }

  // Map old IDs to new backend IDs for sessions referencing courses
  const courseIdMap = new Map<string, string>();

  for (const c of legacy.courses) {
    const created = await createCourse({
      name: c.name,
      type: c.type,
      ects: c.ects,
      estimatedHours: c.estimatedHours,
      estimatedEndDate: c.estimatedEndDate,
      examDate: c.examDate,
      semester: c.semester,
    });
    courseIdMap.set(c.id, created.id);
    // Extended update for migrated progress/hours/status
    await updateCourseExtended(created.id, {
      completedHours: c.completedHours,
      scheduledHours: c.scheduledHours,
      progress: c.progress,
      status: c.status,
    });
  }

  for (const s of legacy.sessions) {
    await createSession({
      courseId: s.courseId ? courseIdMap.get(s.courseId) : undefined,
      studyBlockId: s.studyBlockId || 'block-auto',
      date: s.date,
      startTime: s.startTime,
      endDate: s.endDate,
      endTime: s.endTime,
      durationMinutes: s.durationMinutes,
      notes: s.notes,
    });
  }

  const finalCourses = await getCourses();
  const finalSessions = await getSessions();
  return { migrated: true, courses: finalCourses, sessions: finalSessions };
}

// Health check
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  return fetch(`${API_BASE_URL.replace('/api', '')}/health`).then(r => r.json());
}

// Study Program API
export interface StudyProgram {
  totalECTS: number;
  completedECTS: number;
  hoursPerECTS: number;
}

export async function getStudyProgram(): Promise<StudyProgram> {
  return fetchAPI<StudyProgram>('/study-program');
}

export async function updateStudyProgram(data: Partial<StudyProgram>): Promise<StudyProgram> {
  return fetchAPI<StudyProgram>('/study-program', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Google Calendar Token API
// ============================================================================
// Manages user-specific Google Calendar OAuth tokens stored in backend database

/** Google Calendar OAuth token with metadata */
export interface GoogleCalendarToken {
  accessToken: string;        // OAuth access token for Google Calendar API
  refreshToken?: string;       // Optional refresh token for token renewal
  tokenExpiry?: number;        // Token expiration timestamp
  calendarId?: string;         // ID of the dedicated "Intelligent Study Planner" calendar
  googleEmail?: string;        // User's Google email address
  lastSync?: number;           // Timestamp of last successful sync
}

/**
 * Retrieve current user's Google Calendar token from backend
 * @returns Token object if exists, null if user hasn't connected Google Calendar
 */
export async function getGoogleCalendarToken(): Promise<GoogleCalendarToken | null> {
  try {
    return await fetchAPI<GoogleCalendarToken>('/google-calendar/token');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null; // No token found - user hasn't connected Google Calendar yet
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Save or update Google Calendar token for current user
 * Creates new token entry or updates existing one
 */
export async function saveGoogleCalendarToken(token: Omit<GoogleCalendarToken, 'lastSync'>): Promise<void> {
  await fetchAPI<{ success: boolean }>('/google-calendar/token', {
    method: 'POST',
    body: JSON.stringify(token),
  });
}

/**
 * Delete Google Calendar token (disconnect from Google Calendar)
 * Removes token from backend database
 */
export async function deleteGoogleCalendarToken(): Promise<void> {
  await fetchAPI<{ success: boolean }>('/google-calendar/token', {
    method: 'DELETE',
  });
}

/**
 * Update the last sync timestamp for current user's Google Calendar token
 * Called after successful sync to track sync history
 * @returns New lastSync timestamp
 */
export async function updateLastSync(): Promise<number> {
  const result = await fetchAPI<{ success: boolean; lastSync: number }>('/google-calendar/token/last-sync', {
    method: 'PATCH',
  });
  return result.lastSync;
}
