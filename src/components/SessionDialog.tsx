import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import type { ScheduledSession, Course } from '../types';
import { calculateDuration } from '../lib/scheduler';
import { Trash2, Plus, Info, CalendarIcon } from 'lucide-react';
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
}

export function SessionDialog({ open, onClose, onSave, onDelete, session, courses, sessions = [], onCreateCourse, initialDate, initialStartTime, initialEndTime }: SessionDialogProps) {
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(''); // ISO format for internal use
  const [endDate, setEndDate] = useState(''); // ISO format for internal use
  const [dateDisplay, setDateDisplay] = useState(''); // German format for display
  const [endDateDisplay, setEndDateDisplay] = useState(''); // German format for display
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [recurring, setRecurring] = useState(false);

  // Filter courses: active and planned courses only
  const availableCourses = courses.filter(c => c.status === 'active' || c.status === 'planned');

  // Determine which courses have sessions
  const coursesWithSessions = new Set(sessions.map(s => s.courseId));

  useEffect(() => {
    if (session) {
      setCourseId(session.courseId);
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
      setCourseId(availableCourses[0]?.id || '');
      
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

  const handleSubmit = () => {
    if (!courseId || !date || !endDate) return;

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
      courseId,
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
    if (session && onDelete && confirm('Möchtest du diese Session wirklich löschen?')) {
      onDelete(session.id);
      // Don't call onClose() here - let the parent component handle closing
    }
  };

  const duration = calculateDuration(startTime, endTime, date, endDate);
  const durationHours = Math.round(duration / 60 * 10) / 10;
  
  // Check if all required fields are filled
  const isFormValid = courseId && date && endDate && startTime && endTime && duration > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
            <div className="flex gap-1.5">
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="course" className="flex-1 min-w-0">
                  <SelectValue placeholder="Kurs wählen" />
                </SelectTrigger>
                <SelectContent>
                  {availableCourses.map(course => {
                    const hasSession = coursesWithSessions.has(course.id);
                    return (
                      <SelectItem key={course.id} value={course.id}>
                        {course.name} ({course.ects} ECTS){hasSession ? ' [aktiv]' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {onCreateCourse && (
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon"
                  className="shrink-0 w-9 h-9"
                  onClick={() => {
                    onClose();
                    onCreateCourse();
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
            </div>
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
                  <PopoverContent className="w-auto p-0" align="end">
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
                  <PopoverContent className="w-auto p-0" align="end">
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
              <Input
                id="start"
                type="text"
                value={startTime}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^0-9:]/g, '');
                  // Auto-format: add colon after 2 digits
                  if (value.length === 2 && !value.includes(':')) {
                    value = value + ':';
                  }
                  // Limit to HH:MM format
                  if (value.length <= 5) {
                    setStartTime(value);
                  }
                }}
                onBlur={(e) => {
                  // Validate and format on blur
                  const parts = e.target.value.split(':');
                  if (parts.length === 2) {
                    const hours = Math.min(23, Math.max(0, parseInt(parts[0]) || 0));
                    const minutes = Math.min(59, Math.max(0, parseInt(parts[1]) || 0));
                    setStartTime(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
                  }
                }}
                placeholder="HH:MM (z.B. 18:00)"
                maxLength={5}
              />
            </div>

            <div className="space-y-2 w-full">
              <Label htmlFor="end">Endzeit</Label>
              <Input
                id="end"
                type="text"
                value={endTime}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^0-9:]/g, '');
                  // Auto-format: add colon after 2 digits
                  if (value.length === 2 && !value.includes(':')) {
                    value = value + ':';
                  }
                  // Limit to HH:MM format
                  if (value.length <= 5) {
                    setEndTime(value);
                  }
                }}
                onBlur={(e) => {
                  // Validate and format on blur
                  const parts = e.target.value.split(':');
                  if (parts.length === 2) {
                    const hours = Math.min(23, Math.max(0, parseInt(parts[0]) || 0));
                    const minutes = Math.min(59, Math.max(0, parseInt(parts[1]) || 0));
                    setEndTime(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
                  }
                }}
                placeholder="HH:MM (z.B. 21:00)"
                maxLength={5}
              />
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

        <DialogFooter className="flex items-center justify-between">
          <div>
            {session && onDelete && (
              <Button variant="destructive" onClick={handleDelete} size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Löschen
              </Button>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={!isFormValid}>
            {session ? 'Speichern' : 'Erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
