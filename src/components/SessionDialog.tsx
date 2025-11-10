import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import type { ScheduledSession, Course } from '../types';
import { calculateDuration } from '../lib/scheduler';
import { Trash2, Plus, Info, CalendarIcon, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// Helper functions for date formatting
const formatDateDE = (isoDate: string): string => {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    return format(date, 'dd.MM.yyyy');
  } catch {
    return '';
  }
};

const parseDateDE = (deDate: string): string => {
  if (!deDate) return '';
  try {
    // Try to parse DD.MM.YYYY format
    const parts = deDate.split('.');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return '';
  } catch {
    return '';
  }
};

interface SessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (session: Omit<ScheduledSession, 'id'>, recurring?: { enabled: boolean }) => void;
  onDelete?: (sessionId: string) => void;
  session?: ScheduledSession;
  courses: Course[];
  sessions?: ScheduledSession[];
  onCreateCourse?: () => void;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  onPreviewChange?: (preview: ScheduledSession | null) => void; // Live preview callback
}

export function SessionDialog({ open, onClose, onSave, onDelete, session, courses, sessions = [], onCreateCourse, initialDate, initialStartTime, initialEndTime, onPreviewChange }: SessionDialogProps) {
  // Debug logging
  console.log('SessionDialog render:', { session: session?.id, hasOnDelete: !!onDelete, sessionCourseId: session?.courseId });
  
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(''); // ISO format for internal use
  const [endDate, setEndDate] = useState(''); // ISO format for internal use
  const [dateDisplay, setDateDisplay] = useState(''); // German format for display
  const [endDateDisplay, setEndDateDisplay] = useState(''); // German format for display
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [recurring, setRecurring] = useState(false);
  
  // Clock picker state
  const [startClockMode, setStartClockMode] = useState<'hours' | 'minutes'>('hours');
  const [endClockMode, setEndClockMode] = useState<'hours' | 'minutes'>('hours');
  const [startClockOpen, setStartClockOpen] = useState(false);
  const [endClockOpen, setEndClockOpen] = useState(false);
  
  // Initialize period based on current time
  const getInitialPeriod = (timeStr: string): 'AM' | 'PM' => {
    const [hourStr] = timeStr.split(':');
    const hour = parseInt(hourStr, 10);
    return hour < 12 ? 'AM' : 'PM';
  };
  
  const [startClockPeriod, setStartClockPeriod] = useState<'AM' | 'PM'>(() => getInitialPeriod(startTime));
  const [endClockPeriod, setEndClockPeriod] = useState<'AM' | 'PM'>(() => getInitialPeriod(endTime));
  
  // Time adjustment helpers
  const adjustTime = (time: string, minutes: number): string => {
    const [hours, mins] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor((totalMinutes / 60) % 24);
    const newMins = totalMinutes % 60;
    return `${String(newHours < 0 ? 24 + newHours : newHours).padStart(2, '0')}:${String(newMins < 0 ? 60 + newMins : newMins).padStart(2, '0')}`;
  };
  
  // Clock picker helper - render watch-style clock face
  const renderWatchClock = (mode: 'hours' | 'minutes', time: string, period: 'AM' | 'PM', onTimeChange: (newTime: string) => void, onPeriodChange: (period: 'AM' | 'PM') => void, onClose: () => void) => {
    const [hours, mins] = time.split(':').map(Number);
    const currentHour = hours;
    const currentMinute = mins;
    
    const radius = 100;
    const centerX = 130;
    const centerY = 130;
    
    // Calculate hand angles
    const hourAngle = ((currentHour % 12) / 12) * 2 * Math.PI - Math.PI / 2;
    const minuteAngle = (currentMinute / 60) * 2 * Math.PI - Math.PI / 2;
    
    // Hour hand end point (shorter for 12-hour display)
    const hourHandX = centerX + 50 * Math.cos(hourAngle);
    const hourHandY = centerY + 50 * Math.sin(hourAngle);
    
    // Minute hand end point
    const minuteHandX = centerX + 70 * Math.cos(minuteAngle);
    const minuteHandY = centerY + 70 * Math.sin(minuteAngle);
    
    return (
      <div className="relative bg-white rounded-full shadow-inner" style={{ width: '260px', height: '260px' }}>
        {/* Watch face background */}
        <svg className="absolute inset-0" width="260" height="260">
          {/* Outer circle */}
          <circle cx={centerX} cy={centerY} r={radius} fill="white" stroke="#d1d5db" strokeWidth="3" />
          
          {/* Center dot */}
          <circle cx={centerX} cy={centerY} r="6" fill="#3b82f6" />
          
          {/* Hour hand */}
          <line 
            x1={centerX} 
            y1={centerY} 
            x2={hourHandX} 
            y2={hourHandY} 
            stroke="#374151" 
            strokeWidth="5" 
            strokeLinecap="round"
            opacity={mode === 'hours' ? 1 : 0.3}
          />
          
          {/* Minute hand */}
          <line 
            x1={centerX} 
            y1={centerY} 
            x2={minuteHandX} 
            y2={minuteHandY} 
            stroke="#3b82f6" 
            strokeWidth="3" 
            strokeLinecap="round"
            opacity={mode === 'minutes' ? 1 : 0.3}
          />
        </svg>
        
        {/* Center AM/PM toggle */}
        <button
          type="button"
          onClick={() => onPeriodChange(period === 'AM' ? 'PM' : 'AM')}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center text-xs font-bold text-blue-500 hover:bg-blue-50 transition-colors z-10 shadow-md"
        >
          {period}
        </button>
        
        {mode === 'hours' ? (
          <>
            {/* Hour circle: 1-12 (AM) or 13-0 (PM) */}
            {Array.from({ length: 12 }, (_, i) => i + 1).map((displayValue) => {
              // For AM mode:
              //   Display 1-12, map: 1-11 → 1-11, 12 → 0 (12 AM = midnight)
              // For PM mode:
              //   Display 13-23,12 (where position 12 shows 12), map: 1-11 → 13-23, 12 → 12 (12 PM = noon)
              let actualValue: number;
              let displayText: number;
              
              if (period === 'AM') {
                displayText = displayValue; // Show 1-12
                actualValue = displayValue === 12 ? 0 : displayValue; // 12 AM = 0 (midnight)
              } else {
                displayText = displayValue + 12; // Show 13-24 (which is 13-23, 24)
                actualValue = displayValue + 12; // Map to 13-24
                // Special case: 24 should be displayed and stored as 12 (noon)
                if (displayText === 24) {
                  displayText = 12;
                  actualValue = 12;
                }
              }
              
              const angle = (displayValue / 12) * 2 * Math.PI - Math.PI / 2;
              const outerRadius = 80;
              const x = centerX + outerRadius * Math.cos(angle);
              const y = centerY + outerRadius * Math.sin(angle);
              
              return (
                <button
                  key={`hour-${displayValue}`}
                  type="button"
                  onClick={() => {
                    onTimeChange(`${String(actualValue).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);
                  }}
                  className={`absolute w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                    actualValue === currentHour
                      ? 'bg-blue-500 text-white scale-110' 
                      : 'hover:bg-gray-100 text-gray-700 hover:scale-110'
                  }`}
                  style={{
                    left: `${x - 18}px`,
                    top: `${y - 18}px`,
                  }}
                >
                  {displayText}
                </button>
              );
            })}
          </>
        ) : (
          /* Minutes: 0, 5, 10, ..., 55 */
          Array.from({ length: 12 }, (_, i) => i * 5).map((value) => {
            const angle = (value / 60) * 2 * Math.PI - Math.PI / 2;
            const minuteRadius = 80;
            const x = centerX + minuteRadius * Math.cos(angle);
            const y = centerY + minuteRadius * Math.sin(angle);
            
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onTimeChange(`${String(currentHour).padStart(2, '0')}:${String(value).padStart(2, '0')}`);
                  // Close after selecting minutes
                  setTimeout(() => onClose(), 150);
                }}
                className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  value === currentMinute
                    ? 'bg-blue-500 text-white scale-110' 
                    : 'hover:bg-gray-100 text-gray-700 hover:scale-110'
                }`}
                style={{
                  left: `${x - 16}px`,
                  top: `${y - 16}px`,
                }}
              >
                {String(value).padStart(2, '0')}
              </button>
            );
          })
        )}
      </div>
    );
  };

  // Filter courses: active and planned courses only
  const availableCourses = courses.filter(c => c.status === 'active' || c.status === 'planned');

  // Determine which courses have sessions
  const coursesWithSessions = new Set(sessions.map(s => s.courseId));

  useEffect(() => {
    if (session) {
      setCourseId(session.courseId || ''); // Handle unassigned sessions
      const sessionDate = session.date;
      const sessionEndDate = session.endDate || session.date;
      setDate(sessionDate);
      setEndDate(sessionEndDate);
      setDateDisplay(formatDateDE(sessionDate));
      setEndDateDisplay(formatDateDE(sessionEndDate));
      setStartTime(session.startTime);
      setEndTime(session.endTime);
      setRecurring(false);
    } else {
      // Default to empty (unassigned session)
      setCourseId('');
      
      // Use initial values if provided (from calendar drag)
      if (initialDate) {
        setDate(initialDate);
        setEndDate(initialDate);
        setDateDisplay(formatDateDE(initialDate));
        setEndDateDisplay(formatDateDE(initialDate));
      } else {
        // Default to today - use local date, not UTC
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const localDate = `${year}-${month}-${day}`;
        console.log('📅 SessionDialog: Setting default date to TODAY:', {
          dateObject: today.toString(),
          formattedDate: localDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        setDate(localDate);
        setEndDate(localDate);
        setDateDisplay(formatDateDE(localDate));
        setEndDateDisplay(formatDateDE(localDate));
      }
      
      setStartTime(initialStartTime || '18:00');
      setEndTime(initialEndTime || '21:00');
      setRecurring(false);
    }
  }, [session, open, initialDate, initialStartTime, initialEndTime]);

  // Update preview whenever form values change
  useEffect(() => {
    if (!open || !onPreviewChange) return;
    
    // Allow preview for unassigned sessions (courseId can be empty)
    if (!date || !startTime || !endTime) {
      onPreviewChange(null);
      return;
    }

    const duration = calculateDuration(startTime, endTime, date, endDate || date);
    if (duration <= 0) {
      onPreviewChange(null);
      return;
    }

    // Create preview session
    const preview: ScheduledSession = {
      id: session?.id || 'preview-' + Date.now(),
      courseId,
      studyBlockId: 'manual',
      date,
      endDate: endDate && endDate !== date ? endDate : undefined,
      startTime,
      endTime,
      durationMinutes: duration,
      completed: false,
      completionPercentage: 0,
      notes: '',
    };

    onPreviewChange(preview);
  }, [open, courseId, date, endDate, startTime, endTime, onPreviewChange, session?.id]);

  // Clear preview when dialog closes
  useEffect(() => {
    if (!open && onPreviewChange) {
      onPreviewChange(null);
    }
  }, [open, onPreviewChange]);
  
  // Sync clock period with time changes
  useEffect(() => {
    const [startHour] = startTime.split(':').map(Number);
    const [endHour] = endTime.split(':').map(Number);
    setStartClockPeriod(startHour < 12 ? 'AM' : 'PM');
    setEndClockPeriod(endHour < 12 ? 'AM' : 'PM');
  }, [startTime, endTime]);

  const handleSubmit = () => {
    // Allow unassigned sessions (courseId can be empty)
    if (!date || !endDate) return;

    const duration = calculateDuration(startTime, endTime, date, endDate);
    
    if (duration <= 0) {
      alert('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }

    console.log('📝 Session Dialog Submit:', {
      date,
      endDate,
      startTime,
      endTime,
      duration,
      courseId,
      currentTime: new Date().toString(),
      dateObject: new Date(date).toString(),
      endDateObject: new Date(endDate).toString()
    });

    onSave({
      courseId: courseId || undefined, // Convert empty string to undefined for unassigned sessions
      studyBlockId: 'manual',
      date,
      endDate: endDate !== date ? endDate : undefined, // Only save endDate if different from date
      startTime,
      endTime,
      durationMinutes: duration,
      completed: false,
      completionPercentage: 0,
    }, { enabled: recurring });

    // Don't call onClose() here - let the parent component handle closing
    // This prevents race conditions with state updates
  };

  const handleDelete = () => {
    if (session && onDelete) {
      onDelete(session.id);
      // Don't call onClose() here - let the parent component handle closing
    }
  };

  const duration = calculateDuration(startTime, endTime, date, endDate);
  const durationHours = Math.round(duration / 60 * 10) / 10;
  
  // Check if all required fields are filled (courseId is optional for unassigned sessions)
  const isFormValid = date && endDate && startTime && endTime && duration > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <div className="overflow-y-auto overflow-x-hidden flex-1 px-4 sm:px-6 pt-4 sm:pt-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{session ? 'Session bearbeiten' : 'Neue Session'}</DialogTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Info className="w-4 h-4 text-gray-500" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <p className="text-sm text-gray-600">
                  Plane eine Lernsession für einen deiner Kurse.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <DialogDescription className="sr-only">
            Plane eine Lernsession für einen deiner Kurse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 min-w-0 w-full">
          <div className="space-y-2 w-full">
            <Label htmlFor="course">Kurs</Label>
            <Select value={courseId || "unassigned"} onValueChange={(value) => setCourseId(value === "unassigned" ? "" : value)}>
              <SelectTrigger id="course" className="w-full">
                <SelectValue placeholder="Kurs wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                {availableCourses.map(course => {
                  const hasSession = coursesWithSessions.has(course.id);
                  return (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name} ({course.ects} ECTS){hasSession ? ' [aktiv]' : ''}
                    </SelectItem>
                  );
                })}
                {onCreateCourse && (
                  <div className="border-t mt-1 pt-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-sm transition-colors"
                      onClick={() => {
                        onClose();
                        onCreateCourse();
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Neuen Kurs erstellen</span>
                    </button>
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div className="space-y-2 w-full">
              <Label htmlFor="date">Startdatum</Label>
              <div className="flex gap-1.5">
                <Input
                  id="date"
                  type="text"
                  value={dateDisplay}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDateDisplay(value);
                    const isoDate = parseDateDE(value);
                    if (isoDate) {
                      setDate(isoDate);
                      // Auto-update endDate if it's before the new startDate
                      if (endDate && isoDate > endDate) {
                        setEndDate(isoDate);
                        setEndDateDisplay(formatDateDE(isoDate));
                      }
                    }
                  }}
                  placeholder="TT.MM.JJJJ"
                  className="flex-1 min-w-0"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 w-9 h-9">
                      <CalendarIcon className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white" align="end">
                    <Calendar
                      mode="single"
                      selected={date ? new Date(date) : undefined}
                      onSelect={(selectedDate) => {
                        if (selectedDate) {
                          const newDate = format(selectedDate, 'yyyy-MM-dd');
                          setDate(newDate);
                          setDateDisplay(formatDateDE(newDate));
                          // Auto-update endDate if it's before the new startDate
                          if (endDate && newDate > endDate) {
                            setEndDate(newDate);
                            setEndDateDisplay(formatDateDE(newDate));
                          }
                        }
                      }}
                      locale={de}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2 w-full">
              <Label htmlFor="endDate">Enddatum</Label>
              <div className="flex gap-1.5">
                <Input
                  id="endDate"
                  type="text"
                  value={endDateDisplay}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEndDateDisplay(value);
                    const isoDate = parseDateDE(value);
                    if (isoDate) {
                      setEndDate(isoDate);
                    }
                  }}
                  placeholder="TT.MM.JJJJ"
                  className="flex-1 min-w-0"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 w-9 h-9">
                      <CalendarIcon className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white" align="end">
                    <Calendar
                      mode="single"
                      selected={endDate ? new Date(endDate) : undefined}
                      onSelect={(selectedDate) => {
                        if (selectedDate) {
                          const newEndDate = format(selectedDate, 'yyyy-MM-dd');
                          setEndDate(newEndDate);
                          setEndDateDisplay(formatDateDE(newEndDate));
                        }
                      }}
                      disabled={(calendarDate) => {
                        // Disable dates before startDate
                        if (!date) return false;
                        return calendarDate < new Date(date);
                      }}
                      locale={de}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div className="space-y-2 w-full">
              <Label htmlFor="start">Startzeit</Label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    id="start"
                    type="text"
                    value={startTime}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^0-9:]/g, '');
                      if (value.length === 2 && !value.includes(':')) {
                        value = value + ':';
                      }
                      if (value.length <= 5) {
                        setStartTime(value);
                      }
                    }}
                    onBlur={(e) => {
                      const parts = e.target.value.split(':');
                      if (parts.length === 2) {
                        const hours = Math.min(23, Math.max(0, parseInt(parts[0]) || 0));
                        const minutes = Math.min(59, Math.max(0, parseInt(parts[1]) || 0));
                        setStartTime(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
                      }
                    }}
                    placeholder="HH:MM"
                    maxLength={5}
                    className="pr-8"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                    <button
                      type="button"
                      className="h-3.5 w-6 flex items-center justify-center hover:bg-gray-100 rounded-sm transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setStartTime(adjustTime(startTime, 5));
                        const interval = setInterval(() => setStartTime(prev => adjustTime(prev, 5)), 150);
                        const handleMouseUp = () => {
                          clearInterval(interval);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="h-3.5 w-6 flex items-center justify-center hover:bg-gray-100 rounded-sm transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setStartTime(adjustTime(startTime, -5));
                        const interval = setInterval(() => setStartTime(prev => adjustTime(prev, -5)), 150);
                        const handleMouseUp = () => {
                          clearInterval(interval);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <Popover open={startClockOpen} onOpenChange={setStartClockOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="shrink-0 w-9 h-9"
                      onClick={() => {
                        setStartClockMode('hours');
                        setStartClockOpen(true);
                      }}
                    >
                      <Clock className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4 bg-white" align="end">
                    <div className="flex flex-col items-center gap-3">
                      {startClockMode === 'hours' ? (
                        renderWatchClock('hours', startTime, startClockPeriod, (newTime) => {
                          setStartTime(newTime);
                          setStartClockMode('minutes');
                        }, setStartClockPeriod, () => setStartClockOpen(false))
                      ) : (
                        renderWatchClock('minutes', startTime, startClockPeriod, (newTime) => {
                          setStartTime(newTime);
                        }, setStartClockPeriod, () => setStartClockOpen(false))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2 w-full">
              <Label htmlFor="end">Endzeit</Label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    id="end"
                    type="text"
                    value={endTime}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^0-9:]/g, '');
                      if (value.length === 2 && !value.includes(':')) {
                        value = value + ':';
                      }
                      if (value.length <= 5) {
                        setEndTime(value);
                      }
                    }}
                    onBlur={(e) => {
                      const parts = e.target.value.split(':');
                      if (parts.length === 2) {
                        const hours = Math.min(23, Math.max(0, parseInt(parts[0]) || 0));
                        const minutes = Math.min(59, Math.max(0, parseInt(parts[1]) || 0));
                        setEndTime(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
                      }
                    }}
                    placeholder="HH:MM"
                    maxLength={5}
                    className="pr-8"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                    <button
                      type="button"
                      className="h-3.5 w-6 flex items-center justify-center hover:bg-gray-100 rounded-sm transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEndTime(adjustTime(endTime, 5));
                        const interval = setInterval(() => setEndTime(prev => adjustTime(prev, 5)), 150);
                        const handleMouseUp = () => {
                          clearInterval(interval);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="h-3.5 w-6 flex items-center justify-center hover:bg-gray-100 rounded-sm transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEndTime(adjustTime(endTime, -5));
                        const interval = setInterval(() => setEndTime(prev => adjustTime(prev, -5)), 150);
                        const handleMouseUp = () => {
                          clearInterval(interval);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <Popover open={endClockOpen} onOpenChange={setEndClockOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="shrink-0 w-9 h-9"
                      onClick={() => {
                        setEndClockMode('hours');
                        setEndClockOpen(true);
                      }}
                    >
                      <Clock className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4 bg-white" align="end">
                    <div className="flex flex-col items-center gap-3">
                      {endClockMode === 'hours' ? (
                        renderWatchClock('hours', endTime, endClockPeriod, (newTime) => {
                          setEndTime(newTime);
                          setEndClockMode('minutes');
                        }, setEndClockPeriod, () => setEndClockOpen(false))
                      ) : (
                        renderWatchClock('minutes', endTime, endClockPeriod, (newTime) => {
                          setEndTime(newTime);
                        }, setEndClockPeriod, () => setEndClockOpen(false))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {duration > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-900">
                Dauer: <span className="font-semibold">{durationHours} Stunden</span>
                {endDate && endDate !== date && (
                  <span className="ml-2 text-xs">
                    (über {Math.ceil(duration / (24 * 60))} Tag{Math.ceil(duration / (24 * 60)) > 1 ? 'e' : ''})
                  </span>
                )}
              </div>
            </div>
          )}

          {duration <= 0 && startTime && endTime && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="text-sm text-red-900">
                Die Endzeit muss nach der Startzeit liegen.
              </div>
            </div>
          )}
        </div>
        </div>
        {/* Footer - OUTSIDE scrollable area */}
        <div className="flex flex-row justify-end items-center w-full gap-3 border-t border-gray-200 bg-white px-4 sm:px-6 py-4 shrink-0">
          {session && onDelete && (
            <Button 
              variant="destructive" 
              onClick={handleDelete} 
              size="lg" 
              className="shrink-0 bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Löschen
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={!isFormValid} size="lg" className="bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md disabled:bg-gray-400 shrink-0">
            {session ? 'Speichern' : 'Erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
