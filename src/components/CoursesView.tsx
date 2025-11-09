import { Plus, Pencil, Trash2, BookOpen, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Course, ScheduledSession } from '../lib/types';

interface CoursesViewProps {
  courses: Course[];
  scheduledSessions: ScheduledSession[];
  onAddCourse: () => void;
  onEditCourse: (course: Course) => void;
  onDeleteCourse: (courseId: string) => void;
  onCompleteCourse: (courseId: string) => void;
  onViewChange: (view: 'dashboard' | 'courses' | 'calendar') => void;
}

export function CoursesView({ courses, scheduledSessions, onAddCourse, onEditCourse, onDeleteCourse }: CoursesViewProps) {
  // Calculate actual course status based on sessions and progress
  const getCourseActualStatus = (course: Course): 'planned' | 'active' | 'completed' | null => {
    // If course is marked as completed, keep it
    if (course.status === 'completed') {
      return 'completed';
    }
    
    // Check if there are any sessions for this course
    const courseSessions = scheduledSessions.filter(s => s.courseId === course.id);
    const hasCompletedSessions = courseSessions.some(s => s.completed);
    const hasAnySessions = courseSessions.length > 0;
    
    // Course is active if it has completed sessions or completed hours
    if (hasCompletedSessions || course.completedHours > 0) {
      return 'active';
    }
    
    // Course is planned only if it has scheduled sessions but no completed ones
    if (hasAnySessions && !hasCompletedSessions && course.completedHours === 0) {
      return 'planned';
    }
    
    // Course has not been started and has no sessions
    return null;
  };
  
  // Group courses by semester
  const groupBySemester = () => {
    const grouped = new Map<number | string, Course[]>();
    
    courses.forEach(course => {
      const semester = course.semester || 'Nicht zugeordnet';
      if (!grouped.has(semester)) {
        grouped.set(semester, []);
      }
      grouped.get(semester)!.push(course);
    });
    
    // Sort semesters numerically (put "Nicht zugeordnet" at the end)
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => {
      if (a[0] === 'Nicht zugeordnet') return 1;
      if (b[0] === 'Nicht zugeordnet') return -1;
      return Number(a[0]) - Number(b[0]);
    });
    
    return sortedEntries;
  };
  
  const semesterGroups = groupBySemester();

  const renderCourseCard = (course: Course) => {
    const actualStatus = getCourseActualStatus(course);
    const hasStarted = actualStatus === 'active' || actualStatus === 'completed' || actualStatus === 'planned';
    const isCompleted = actualStatus === 'completed';
    
    return (
      <Card key={course.id} className={`transition-shadow h-full flex flex-col ${isCompleted ? 'opacity-50 bg-gray-50' : 'hover:shadow-lg'}`}>
        <CardHeader className="pb-1">
          <CardTitle className={`text-base ${isCompleted ? 'text-gray-500' : ''}`}>{course.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-end pt-0 space-y-1.5">
        {isCompleted ? (
          /* Simplified display for completed courses */
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs">{course.ects} ECTS</Badge>
              <Badge className="bg-gray-400 text-white text-xs">Abgeschlossen</Badge>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEditCourse(course)}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  if (confirm('Möchtest du diesen Kurs wirklich löschen?')) {
                    onDeleteCourse(course.id);
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={course.type === 'written-exam' ? 'default' : 'secondary'} className="text-xs">
                  {course.type === 'written-exam' ? 'Prüfung' : 'Projekt'}
                </Badge>
                <Badge variant="outline" className="text-xs">{course.ects} ECTS</Badge>
                {(() => {
                  if (actualStatus === 'active') {
                    return <Badge className="bg-green-500 text-white text-xs">Aktiv</Badge>;
                  }
                  if (actualStatus === 'planned') {
                    return <Badge variant="secondary" className="text-xs">Geplant</Badge>;
                  }
                  return null;
                })()}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEditCourse(course)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (confirm('Möchtest du diesen Kurs wirklich löschen?')) {
                      onDeleteCourse(course.id);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </div>
            </div>

            {!hasStarted ? (
              /* Compact display for not started courses */
              course.examDate && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <CalendarIcon className="w-3 h-3" />
                  <span>
                    {new Date(course.examDate).toLocaleDateString('de-DE', { 
                      day: '2-digit', 
                      month: '2-digit'
                    })}
                  </span>
                </div>
              )
            ) : (
              /* Full display for started courses */
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>
                      {Math.round(course.completedHours)}h / {Math.round(course.estimatedHours)}h
                    </span>
                  </div>

                  {course.examDate && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CalendarIcon className="w-4 h-4" />
                      <span>
                        {course.type === 'written-exam' ? 'Prüfung: ' : 'Abgabe: '}
                        {new Date(course.examDate).toLocaleDateString('de-DE', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </span>
                    </div>
                  )}

                  {/* Three-part progress bar: Completed (green), Scheduled (yellow), Open (gray) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Fortschritt</span>
                      <span>{Math.round(course.completedHours)}h / {Math.round(course.estimatedHours)}h</span>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden flex">
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
                        const actualWidth = (course.scheduledHours / course.estimatedHours) * 100;
                        const minWidth = actualWidth > 0 ? 12 : 0;
                        const displayWidth = actualWidth > 0 ? Math.max(actualWidth, minWidth) : 0;
                        return displayWidth > 0 ? (
                          <div 
                            className="h-full bg-yellow-400 transition-all flex items-center justify-center"
                            style={{ width: `${displayWidth}%` }}
                          >
                            <span className="text-xs text-gray-900 px-2 truncate">
                              {Math.round(course.scheduledHours)}h
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
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
    );
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-4 relative">
      <div className="max-w-7xl mx-auto">

        {courses.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-gray-900 mb-2">Keine Kurse vorhanden</h3>
              <p className="text-sm text-gray-600 mb-4">
                Erstelle deinen ersten Kurs, um mit der Planung zu beginnen.
              </p>
              <Button onClick={onAddCourse}>
                <Plus className="w-4 h-4 mr-2" />
                Kurs erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {semesterGroups.map(([semester, semesterCourses]) => {
              // Separate courses by status: active/planned vs completed/not-started
              const activeOrPlannedCourses = semesterCourses.filter(c => {
                const status = getCourseActualStatus(c);
                return status === 'active' || status === 'planned';
              });
              const compactCourses = semesterCourses.filter(c => {
                const status = getCourseActualStatus(c);
                return status === 'completed' || status === null;
              });
              
              return (
                <div key={semester} className="space-y-4">
                  <h3 className="text-gray-900">
                    {semester === 'Nicht zugeordnet' 
                      ? 'Nicht zugeordnet' 
                      : `${semester}. Semester`}
                  </h3>
                  
                  {/* Active and planned courses (full width) */}
                  {activeOrPlannedCourses.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeOrPlannedCourses.map(renderCourseCard)}
                    </div>
                  )}
                  
                  {/* Completed and not-started courses (half width) */}
                  {compactCourses.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {compactCourses.map(renderCourseCard)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Floating Add Button */}
      <Button
        onClick={onAddCourse}
        size="icon"
        className="fixed bottom-20 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow z-50 lg:bottom-6"
      >
        <Plus className="w-6 h-6" />
      </Button>
    </div>
  );
}
