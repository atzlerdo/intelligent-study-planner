import { useState } from 'react';
import { Plus, Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Home, BookOpen, Menu } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { ScheduledSession, Course } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface CalendarViewProps {
  sessions: ScheduledSession[];
  courses: Course[];
  onAddSession: () => void;
  onEditSession: (session: ScheduledSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onViewChange: (view: 'dashboard' | 'courses' | 'calendar') => void;
}

export function CalendarView({ 
  sessions, 
  courses, 
  onAddSession,
  onEditSession,
  onViewChange
}: CalendarViewProps) {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  
  // Get start of current week (Monday)
  const getWeekStart = (offset: number = 0): Date => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1) + (offset * 7);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const weekStart = getWeekStart(currentWeekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  // Get sessions for a specific day
  const getSessionsForDay = (date: Date): ScheduledSession[] => {
    const dateStr = date.toISOString().split('T')[0];
    return sessions
      .filter(s => s.date === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getCourseName = (courseId: string): string => {
    return courses.find(c => c.id === courseId)?.name || 'Kurs';
  };

  const getCourseColor = (courseId: string): string => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return 'bg-gray-100 text-gray-900';
    
    // Different colors based on course ID
    const colors = [
      'bg-blue-100 text-blue-900 border-blue-200',
      'bg-purple-100 text-purple-900 border-purple-200',
      'bg-green-100 text-green-900 border-green-200',
      'bg-orange-100 text-orange-900 border-orange-200',
      'bg-pink-100 text-pink-900 border-pink-200',
    ];
    return colors[parseInt(courseId) % colors.length] || colors[0];
  };

  const formatDate = (date: Date): string => {
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return `${days[date.getDay()]}, ${date.getDate()}.${date.getMonth() + 1}.`;
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const totalSessionsThisWeek = weekDays.reduce(
    (sum, day) => sum + getSessionsForDay(day).length, 
    0
  );

  const totalHoursThisWeek = weekDays.reduce((sum, day) => {
    const daySessions = getSessionsForDay(day);
    return sum + daySessions.reduce((s, session) => s + session.durationMinutes / 60, 0);
  }, 0);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin max-w-md mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-gray-900">Kalender</h2>
          <p className="text-gray-600">Deine geplanten Lernsessions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onAddSession} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Session
          </Button>
          
          {/* Navigation Menu - Top Right (Mobile Only) */}
          <div className="lg:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onViewChange('dashboard')}>
                  <Home className="w-4 h-4 mr-2" />
                  Start
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewChange('courses')}>
                  <BookOpen className="w-4 h-4 mr-2" />
                  Kurse
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewChange('calendar')}>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Kalender
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="text-center">
              <div className="text-sm text-gray-600">
                {weekDays[0].getDate()}.{weekDays[0].getMonth() + 1}. - {weekDays[6].getDate()}.{weekDays[6].getMonth() + 1}.
              </div>
              <div className="text-xs text-gray-500">
                {totalSessionsThisWeek} Sessions · {Math.round(totalHoursThisWeek * 10) / 10}h
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          {currentWeekOffset !== 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeekOffset(0)}
              className="w-full mt-2"
            >
              Zu dieser Woche
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Week Days */}
      <div className="space-y-3">
        {weekDays.map((date, index) => {
          const daySessions = getSessionsForDay(date);
          const dayHours = daySessions.reduce((sum, s) => sum + s.durationMinutes / 60, 0);
          
          return (
            <Card key={index} className={isToday(date) ? 'border-blue-500 border-2' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-gray-900">{formatDate(date)}</h3>
                      {isToday(date) && (
                        <Badge variant="default" className="text-xs">Heute</Badge>
                      )}
                    </div>
                    {daySessions.length > 0 && (
                      <div className="text-sm text-gray-600">
                        {daySessions.length} {daySessions.length === 1 ? 'Session' : 'Sessions'} · {Math.round(dayHours * 10) / 10}h
                      </div>
                    )}
                  </div>
                  <CalendarIcon className="w-5 h-5 text-gray-400" />
                </div>

                {daySessions.length === 0 ? (
                  <div className="text-sm text-gray-400 italic py-2">
                    Keine Sessions geplant
                  </div>
                ) : (
                  <div className="space-y-2">
                    {daySessions.map(session => {
                      const course = courses.find(c => c.id === session.courseId);
                      
                      return (
                        <div
                          key={session.id}
                          onClick={() => onEditSession(session)}
                          className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${getCourseColor(session.courseId)}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm truncate">
                                  {getCourseName(session.courseId)}
                                </span>
                                {course && (
                                  <Badge variant="outline" className="text-xs">
                                    {course.ects} ECTS
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs opacity-80">
                                <Clock className="w-3 h-3" />
                                <span>{session.startTime} - {session.endTime}</span>
                                <span>·</span>
                                <span>{session.durationMinutes / 60}h</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
