import { BookOpen, Clock, TrendingUp, Info, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { Course, StudyProgram, ScheduledSession } from '../../types';
import { WeekCalendar } from '../WeekCalendar';


interface DashboardProps {
  courses: Course[];
  studyProgram: StudyProgram;
  scheduledSessions: ScheduledSession[];
  onSessionClick: (session: ScheduledSession) => void;
  onViewChange: (view: 'dashboard' | 'courses' | 'calendar') => void;
  currentView: 'dashboard' | 'courses' | 'calendar';
  onCreateSession?: (date: string, startTime: string, endTime: string) => void;
  onEditCourse?: (course: Course) => void;
  onSessionMove?: (session: ScheduledSession, newDate: string, newStartTime: string, newEndTime: string) => void;
  onSessionsImported?: (sessions: ScheduledSession[]) => void;
  onSessionsDeleted?: (sessionIds: string[]) => void;
  autoSyncTrigger?: number;
  previewSession?: ScheduledSession | null;
  editingSessionId?: string | null;
  isDialogOpen?: boolean;
}

export function Dashboard({ courses, studyProgram, scheduledSessions, onSessionClick, onCreateSession, onEditCourse, onSessionMove, onSessionsImported, onSessionsDeleted, autoSyncTrigger, /* previewSession unused with FullCalendar */ /* editingSessionId unused */ isDialogOpen }: DashboardProps) {
  // Filter for active courses that have at least one session assigned
  // A course should only appear on the dashboard if it has sessions
  const courseSessionCounts = new Map<string, number>();
  scheduledSessions.forEach(session => {
    if (session.courseId) {
      courseSessionCounts.set(session.courseId, (courseSessionCounts.get(session.courseId) || 0) + 1);
    }
  });
  
  const activeCourses = courses.filter(c => 
    c.status === 'active' && courseSessionCounts.has(c.id)
  );
  const activeCourseIds = new Set(activeCourses.map(c => c.id));
  
  // Get all sessions for active courses + unassigned sessions (blockers)
  const relevantSessions = scheduledSessions.filter(session => {
    if (!session.courseId) return true; // Include unassigned sessions
    return activeCourseIds.has(session.courseId);
  });
  
  // Calculate totals
  const coursesScheduledHours = courses
    .filter(c => c.status === 'active' || c.status === 'planned')
    .reduce((sum, c) => sum + c.scheduledHours, 0);
  
  // Add unassigned session hours to the total
  const unassignedHours = scheduledSessions
    .filter(s => !s.courseId && !s.completed)
    .reduce((sum, s) => sum + (s.durationMinutes / 60), 0);
  
  const scheduledHours = coursesScheduledHours + unassignedHours;
  
  // Calculate total completed hours from all courses (not just finished courses)
  const completedHoursFromCourses = courses
    .reduce((sum, c) => sum + c.completedHours, 0);
  
  // Add the initial completed ECTS from onboarding (already achieved before using the app)
  // This ensures pre-existing achievements are shown in the progress bar
  const completedCoursesECTS = courses
    .filter(c => c.status === 'completed')
    .reduce((sum, c) => sum + c.ects, 0);
  
  // studyProgram.completedECTS includes both initial onboarding value AND completed courses
  // To avoid double-counting completed courses, we calculate: initial = total - courses
  const initialCompletedECTS = studyProgram.completedECTS - completedCoursesECTS;
  const initialCompletedHours = Math.max(0, initialCompletedECTS * studyProgram.hoursPerECTS);
  
  // Total completed hours = initial achievements + session-level completions
  const totalCompletedHours = initialCompletedHours + completedHoursFromCourses;

  return (
    <div className="h-full overflow-hidden lg:overflow-hidden overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto lg:h-full">

        {/* Desktop: 30/70 Split, Mobile: Stacked */}
        <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-6 lg:h-full">
          {/* Left Column - Dashboard & Courses (30%) */}
          <div className="space-y-4 lg:flex lg:flex-col lg:overflow-hidden overflow-y-auto scrollbar-thin">
            {/* Overall Progress Card */}
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 lg:flex-shrink-0 gap-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-2xl">
                  <TrendingUp className="w-6 h-6" />
                  <span>{studyProgram.completedECTS} / {studyProgram.totalECTS} ECTS</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* ECTS Progress */}
                <div className="space-y-2">
                  
                  {/* Combined Progress Bar */}
                  <div className="space-y-2">
                    <div className="h-6 bg-white/20 rounded-full overflow-hidden flex">
                      {/* Completed portion - Green */}
                      {(() => {
                        const totalHours = studyProgram.totalECTS * studyProgram.hoursPerECTS;
                        const actualWidth = (totalCompletedHours / totalHours) * 100;
                        const minWidth = actualWidth > 0 ? 12 : 0;
                        const displayWidth = actualWidth > 0 ? Math.max(actualWidth, minWidth) : 0;
                        return (
                          <div 
                            className="h-full bg-green-400 transition-all flex items-center justify-center"
                            style={{ width: `${displayWidth}%` }}
                          >
                            <span className="text-xs px-2 truncate">
                              {Math.round(totalCompletedHours)}h
                            </span>
                          </div>
                        );
                      })()}
                      
                      {/* Scheduled portion - Yellow */}
                      {(() => {
                        const totalHours = studyProgram.totalECTS * studyProgram.hoursPerECTS;
                        const actualWidthPct = (scheduledHours / totalHours) * 100;
                        const label = `${Math.round(scheduledHours)}h`;
                        // Estimate minimal pixel width needed for label (approx character width * chars + padding)
                        const labelCharWidth = 6; // rough average for text-xs
                        const labelPadding = 12; // px (left+right)
                        const minPixelWidth = (label.length * labelCharWidth) + labelPadding;
                        return actualWidthPct > 0 ? (
                          <div
                            className="h-full bg-yellow-400 transition-all flex items-center justify-center"
                            style={{ 
                              width: `${actualWidthPct}%`,
                              minWidth: `${minPixelWidth}px`
                            }}
                          >
                            <span className="text-xs text-gray-900 px-2 whitespace-nowrap">{label}</span>
                          </div>
                        ) : null;
                      })()}
                      
                      {/* Remaining portion - Gray */}
                      {(() => {
                        const totalHours = studyProgram.totalECTS * studyProgram.hoursPerECTS;
                        const remaining = totalHours - totalCompletedHours - scheduledHours;
                        const actualWidth = Math.max(0, (remaining / totalHours) * 100);
                        const minWidth = actualWidth > 0 ? 12 : 0;
                        const displayWidth = actualWidth > 0 ? Math.max(actualWidth, minWidth) : 0;
                        return (
                          <div 
                            className="h-full bg-white/30 transition-all flex items-center justify-center"
                            style={{ width: `${displayWidth}%` }}
                          >
                            <span className="text-xs text-white/90 px-2 truncate">
                              {Math.round(remaining)}h
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Legend with Info button */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 text-xs text-white/90">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
                          <span>Verbracht</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                          <span>Verplant</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-white/30 rounded-sm"></div>
                          <span>Offen</span>
                        </div>
                      </div>
                      
                      {/* Info button on same line as legend */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20 flex-shrink-0">
                            <Info className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72">
                          <div className="space-y-2">
                            <p className="text-sm">
                              <strong>Gesamt:</strong> {Math.round(studyProgram.totalECTS * studyProgram.hoursPerECTS)} Stunden
                            </p>
                            <p className="text-sm text-gray-600">
                              {studyProgram.hoursPerECTS}h pro ECTS-Punkt ({studyProgram.totalECTS} ECTS insgesamt)
                            </p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Courses List */}
            {activeCourses.length > 0 ? (
              <div className="space-y-3 lg:flex lg:flex-col lg:overflow-hidden lg:flex-1 lg:min-h-0">
                <h2 className="text-gray-900 lg:flex-shrink-0">Aktive Kurse</h2>
                
                <div className="space-y-3 lg:overflow-y-auto lg:pr-2 scrollbar-thin">
                {activeCourses.map(course => (
                    <Card key={course.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="text-gray-900">{course.name}</h3>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge variant={course.type === 'written-exam' ? 'default' : 'secondary'} className="text-xs">
                                  {course.type === 'written-exam' ? 'Prüfung' : 'Projekt'}
                                </Badge>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm text-gray-600">
                                    {Math.round(course.completedHours)}h / {course.estimatedHours}h
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {course.ects} ECTS
                              </Badge>
                              {onEditCourse && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => onEditCourse(course)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* Three-part progress bar: Completed (green), Scheduled (yellow), Open (gray) */}
                          <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded-full overflow-hidden flex">
                              {/* Completed hours - Green */}
                              {(() => {
                                const actualWidth = (course.completedHours / course.estimatedHours) * 100;
                                const minWidth = actualWidth > 0 ? 12 : 0;
                                const displayWidth = actualWidth > 0 ? Math.max(actualWidth, minWidth) : 0;
                                return displayWidth > 0 ? (
                                  <div 
                                    className="h-full bg-green-400 transition-all flex items-center justify-center"
                                    style={{ width: `${displayWidth}%` }}
                                  >
                                    <span className="text-xs px-2 truncate">
                                      {Math.round(course.completedHours)}h
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                              
                              {/* Scheduled hours - Yellow */}
                              {(() => {
                                const actualWidthPct = (course.scheduledHours / course.estimatedHours) * 100;
                                const label = `${Math.round(course.scheduledHours)}h`;
                                const labelCharWidth = 6;
                                const labelPadding = 10;
                                const minPixelWidth = (label.length * labelCharWidth) + labelPadding;
                                return actualWidthPct > 0 ? (
                                  <div
                                    className="h-full bg-yellow-400 transition-all flex items-center justify-center"
                                    style={{ 
                                      width: `${actualWidthPct}%`,
                                      minWidth: `${minPixelWidth}px`
                                    }}
                                  >
                                    <span className="text-xs text-gray-900 px-2 whitespace-nowrap">
                                      {label}
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                              
                              {/* Remaining/Open hours - Gray */}
                              {(() => {
                                const remaining = course.estimatedHours - course.completedHours - course.scheduledHours;
                                const actualWidth = Math.max(0, (remaining / course.estimatedHours) * 100);
                                const minWidth = actualWidth > 0 ? 12 : 0;
                                const displayWidth = actualWidth > 0 ? Math.max(actualWidth, minWidth) : 0;
                                return displayWidth > 0 ? (
                                  <div 
                                    className="h-full transition-all flex items-center justify-center"
                                    style={{ width: `${displayWidth}%` }}
                                  >
                                    <span className="text-xs text-gray-600 px-2 truncate">
                                      {Math.round(remaining)}h
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            
                            {/* Legend */}
                            <div className="flex items-center gap-4 text-xs text-gray-600">
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
                                <span>Verbracht</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                                <span>Verplant</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                                <span>Offen</span>
                              </div>
                            </div>
                          </div>
                          
                          {course.examDate && (
                            <div className="text-sm text-gray-600">
                              <span>
                                {course.type === 'written-exam' ? 'voraussichtlich Prüfung: ' : 'voraussichtlich Abgabe: '}
                                {new Date(course.examDate).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          )}

                          {/* Milestones */}
                          {course.milestones.length > 0 && (
                            <div className="pt-3 border-t space-y-2">
                              <div className="text-sm text-gray-600">Meilensteine:</div>
                              <div className="space-y-1.5">
                                {course.milestones.map(milestone => (
                                  <div key={milestone.id} className="flex items-center gap-2 text-sm">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${milestone.completed ? 'bg-green-500' : 'bg-gray-300'}`} />
                                    <span className={milestone.completed ? 'text-gray-400 line-through' : 'text-gray-700'}>
                                      {milestone.title}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                ))}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-gray-900 mb-1">Keine aktiven Kurse</h3>
                  <p className="text-sm text-gray-600">
                    Gehe zu "Kurse", um einen neuen Kurs zu starten.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Week Calendar (70%) */}
          <div className="lg:h-full lg:overflow-hidden">
            <WeekCalendar 
              sessions={relevantSessions}
              courses={courses}
              onSessionClick={onSessionClick}
              onCreateSession={onCreateSession}
              onSessionMove={onSessionMove}
              onSessionsImported={onSessionsImported}
              onSessionsDeleted={onSessionsDeleted}
              autoSyncTrigger={autoSyncTrigger}
              previewSession={undefined}
              editingSessionId={undefined}
              isDialogOpen={isDialogOpen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
