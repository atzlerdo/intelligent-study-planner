import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Download, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import type { ScheduledSession, Course } from '../types';
import { motion, useMotionValue, animate } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { useIsMobile } from './ui/use-mobile';

interface WeekCalendarProps {
  sessions: ScheduledSession[];
  courses: Course[];
  onSessionClick: (session: ScheduledSession) => void;
  onCreateSession?: (date: string, startTime: string, endTime: string) => void;
  onSessionMove?: (session: ScheduledSession, newDate: string, newStartTime: string, newEndTime: string) => void;
}

export function WeekCalendar({ sessions, courses, onSessionClick, onCreateSession, onSessionMove }: WeekCalendarProps) {
  const isMobile = useIsMobile();
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const x = useMotionValue(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Helper function to format date to local YYYY-MM-DD without UTC conversion
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;
    console.log('📅 formatDateToLocal:', { 
      input: date.toString(), 
      output: localDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    return localDate;
  };
  
  // Drag-to-create state
  const [isDraggingNew, setIsDraggingNew] = useState(false);
  const [dragStart, setDragStart] = useState<{ date: string; minutes: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ minutes: number } | null>(null);
  
  // Drag-to-move session state
  const [draggedSession, setDraggedSession] = useState<ScheduledSession | null>(null);
  const [dragSessionPosition, setDragSessionPosition] = useState<{ x: number; y: number } | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number; date: string; minutes: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [draggedSessionSize, setDraggedSessionSize] = useState<{ width: number; height: number } | null>(null);
  const [isInteractingWithSession, setIsInteractingWithSession] = useState(false);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Global pointer move listener for smooth dragging
  useEffect(() => {
    if (!draggedSession) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      setDragSessionPosition({ x: e.clientX, y: e.clientY });
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      // Trigger the same logic as handleSessionPointerUp
      if (draggedSession && dragStartPos && dragSessionPosition && onSessionMove) {
        const hourHeight = 60;
        const dayWidth = scrollContainerRef.current ? 
          (scrollContainerRef.current.clientWidth - 56) / 7 : 100;
        
        const dayOffset = Math.round((e.clientX - dragStartPos.x) / dayWidth);
        const timeOffsetMinutes = Math.round(((e.clientY - dragStartPos.y) / hourHeight) * 60);
        const snappedTimeOffset = snapTo15Min(timeOffsetMinutes);
        
        const currentDate = new Date(dragStartPos.date);
        currentDate.setDate(currentDate.getDate() + dayOffset);
        const newDate = formatDateToLocal(currentDate);
        
        const newStartMinutes = Math.max(0, Math.min(1440 - draggedSession.durationMinutes, 
          dragStartPos.minutes + snappedTimeOffset));
        const newEndMinutes = newStartMinutes + draggedSession.durationMinutes;
        
        const newStartHour = Math.floor(newStartMinutes / 60);
        const newStartMin = newStartMinutes % 60;
        const newEndHour = Math.floor(newEndMinutes / 60);
        const newEndMin = newEndMinutes % 60;
        
        const newStartTime = `${String(newStartHour).padStart(2, '0')}:${String(newStartMin).padStart(2, '0')}`;
        const newEndTime = `${String(newEndHour).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`;
        
        if (newDate !== draggedSession.date || newStartTime !== draggedSession.startTime) {
          onSessionMove(draggedSession, newDate, newStartTime, newEndTime);
        }
      }
      
      // Reset drag state
      setDraggedSession(null);
      setDragSessionPosition(null);
      setDragStartPos(null);
      setDragOffset(null);
      setDraggedSessionSize(null);
      
      setTimeout(() => {
        setIsInteractingWithSession(false);
      }, 100);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [draggedSession, dragStartPos, dragSessionPosition, onSessionMove]);

  // Track initial mount to determine scroll behavior
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Check if we're viewing the current week
  const isCurrentWeek = currentWeekOffset === 0;

  // Auto-scroll to current time on mount and week change with 2-hour buffer
  useEffect(() => {
    if (scrollContainerRef.current && isCurrentWeek) {
      const currentHour = currentTime.getHours();
      const currentMinutes = currentTime.getMinutes();
      const hourHeight = 60;
      
      const currentPosition = (currentHour * hourHeight) + (currentMinutes / 60 * hourHeight);
      // 2-hour buffer = 2 * 60px = 120px
      // On mobile, center the current time more for better visibility
      const buffer = isMobile ? 2.5 * hourHeight : 2 * hourHeight;
      const scrollPosition = Math.max(0, currentPosition - buffer);
      
      // Use instant scroll on mount, smooth on week change
      scrollContainerRef.current.scrollTo({
        top: scrollPosition,
        behavior: isInitialMount ? 'auto' : 'smooth'
      });
      
      if (isInitialMount) setIsInitialMount(false);
    } else if (scrollContainerRef.current && !isCurrentWeek) {
      // For non-current weeks, scroll to 6am as a reasonable default
      const hourHeight = 60;
      const defaultScroll = 6 * hourHeight;
      scrollContainerRef.current.scrollTo({
        top: defaultScroll,
        behavior: isInitialMount ? 'auto' : 'smooth'
      });
      
      if (isInitialMount) setIsInitialMount(false);
    }
  }, [currentWeekOffset, isCurrentWeek, isMobile, isInitialMount]);

  const allHours = Array.from({ length: 24 }, (_, i) => i);

  const getWeekStart = (offset: number = 0): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1) + (offset * 7);
    const monday = new Date(today);
    monday.setDate(diff);
    return monday;
  };

  const weekStart = getWeekStart(currentWeekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  const getSessionsForDay = (date: Date): ScheduledSession[] => {
    const dateStr = formatDateToLocal(date);
    return sessions.filter(s => {
      // Check if session starts on this day
      if (s.date === dateStr) return true;
      
      // Check if session spans multiple days and this date is within range
      if (s.endDate && s.endDate !== s.date) {
        const sessionStart = new Date(s.date);
        const sessionEnd = new Date(s.endDate);
        const currentDate = new Date(dateStr);
        
        // Remove time component for date comparison
        sessionStart.setHours(0, 0, 0, 0);
        sessionEnd.setHours(0, 0, 0, 0);
        currentDate.setHours(0, 0, 0, 0);
        
        return currentDate >= sessionStart && currentDate <= sessionEnd;
      }
      
      return false;
    });
  };

  const formatDayHeader = (date: Date): { day: string; date: string } => {
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return {
      day: days[date.getDay()],
      date: `${date.getDate()}.${date.getMonth() + 1}.`
    };
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getCourseName = (courseId: string): string => {
    return courses.find(c => c.id === courseId)?.name || 'Kurs';
  };

  const getSessionColor = (session: ScheduledSession): string => {
    if (session.completed) {
      // Check if this was attended (has completionPercentage > 0) or not attended
      if (session.completionPercentage && session.completionPercentage > 0) {
        return 'bg-green-100 border-green-400 text-green-900';
      } else {
        return 'bg-gray-200 border-gray-400 text-gray-600';
      }
    }
    
    // Check if session has valid endTime
    if (!session.endTime) {
      // If no endTime, treat as future session
      return 'bg-yellow-100 border-yellow-400 text-yellow-900';
    }
    
    // Create datetime for session end in local timezone
    try {
      // Use endDate if available (for multi-day sessions), otherwise use date
      const endDateStr = session.endDate || session.date;
      const [year, month, day] = endDateStr.split('-').map(Number);
      const [endHour, endMinute] = session.endTime.split(':').map(Number);
      
      // Create date object - use current date to avoid timezone issues
      const sessionEndDate = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
      const now = new Date();
      
      const isPast = sessionEndDate.getTime() < now.getTime();
      
      console.log('🎨 Session Color Check:', {
        sessionId: session.id,
        course: session.courseId,
        dateString: session.date,
        timeString: `${session.startTime} - ${session.endTime}`,
        parsedDate: {
          year,
          month,
          day,
          endHour,
          endMinute
        },
        sessionEndDate: sessionEndDate.toString(),
        sessionEndTimestamp: sessionEndDate.getTime(),
        now: now.toString(),
        nowTimestamp: now.getTime(),
        difference: (sessionEndDate.getTime() - now.getTime()) / 1000 / 60, // minutes
        isPast,
        willBeColor: isPast ? 'RED' : 'YELLOW'
      });
      
      // Session has ended and needs evaluation
      if (isPast) {
        return 'bg-red-100 border-red-400 text-red-900';
      }
    } catch (error) {
      // If parsing fails, treat as future session
      console.error('❌ Error parsing session date/time:', error, session);
      return 'bg-yellow-100 border-yellow-400 text-yellow-900';
    }
    
    // Planned future session
    return 'bg-yellow-100 border-yellow-400 text-yellow-900';
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      setCurrentWeekOffset(currentWeekOffset - 1);
    } else if (info.offset.x < -threshold) {
      setCurrentWeekOffset(currentWeekOffset + 1);
    }
    animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
  };

  const goToWeek = (offset: number) => {
    setCurrentWeekOffset(offset);
  };

  const goToToday = () => {
    setCurrentWeekOffset(0);
  };

  const calculateSessionPosition = (session: ScheduledSession, currentDate?: Date): { top: number; height: number } => {
    const hourHeight = 60;
    
    // For multi-day sessions, we need to calculate which portion to show on this day
    if (session.endDate && session.endDate !== session.date && currentDate) {
      const sessionStart = new Date(session.date);
      const sessionEnd = new Date(session.endDate);
      const currentDateOnly = new Date(currentDate);
      
      // Remove time components for date comparison
      sessionStart.setHours(0, 0, 0, 0);
      sessionEnd.setHours(0, 0, 0, 0);
      currentDateOnly.setHours(0, 0, 0, 0);
      
      const [startHour, startMin] = session.startTime.split(':').map(Number);
      const [endHour, endMin] = session.endTime.split(':').map(Number);
      
      // First day of multi-day session
      if (currentDateOnly.getTime() === sessionStart.getTime()) {
        const startMinutes = startHour * 60 + startMin;
        const top = (startMinutes / 60) * hourHeight;
        const height = (24 * 60 - startMinutes) / 60 * hourHeight; // Until midnight
        return { top, height: Math.max(height, 30) };
      }
      
      // Last day of multi-day session
      if (currentDateOnly.getTime() === sessionEnd.getTime()) {
        const endMinutes = endHour * 60 + endMin;
        const top = 0; // Start from midnight
        const height = (endMinutes / 60) * hourHeight;
        return { top, height: Math.max(height, 30) };
      }
      
      // Middle days - full day
      if (currentDateOnly > sessionStart && currentDateOnly < sessionEnd) {
        return { top: 0, height: 24 * hourHeight };
      }
    }
    
    // Single-day session (default behavior)
    const [startHourStr, startMinStr] = session.startTime.split(':').map(Number);
    const startMinutes = startHourStr * 60 + startMinStr;
    const top = (startMinutes / 60) * hourHeight;
    const durationMinutes = session.durationMinutes;
    const height = (durationMinutes / 60) * hourHeight;
    
    return { 
      top, 
      height: Math.max(height, 30)
    };
  };

  const getCurrentTimePosition = (): { position: number; isVisible: boolean } => {
    const hourHeight = 60;
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const position = (totalMinutes / 60) * hourHeight;
    
    const isVisible = hours >= 0 && hours < 24;
    
    return { position, isVisible };
  };

  // Helper to snap to 15-minute intervals
  const snapTo15Min = (minutes: number): number => {
    return Math.floor(minutes / 15) * 15;
  };

  // Session drag handlers
  const handleSessionPointerDown = (session: ScheduledSession, date: Date, e: React.PointerEvent) => {
    if (!onSessionMove) return;
    
    e.stopPropagation();
    
    // Mark that we're interacting with a session to prevent creating a new one
    setIsInteractingWithSession(true);
    
    const target = e.currentTarget as HTMLElement;
    
    const timer = setTimeout(() => {
      // Long press detected, start dragging
      const rect = target.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      
      const dateStr = formatDateToLocal(date);
      const [startHour, startMin] = session.startTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      
      setDraggedSession(session);
      setDragOffset({ x: offsetX, y: offsetY });
      setDraggedSessionSize({ width: rect.width, height: rect.height });
      setDragStartPos({ 
        x: e.clientX, 
        y: e.clientY,
        date: dateStr,
        minutes: startMinutes
      });
      // Set initial position so element follows cursor immediately
      setDragSessionPosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
    }, 200); // 200ms long press - faster response
    
    setLongPressTimer(timer);
  };

  const handleSessionPointerMove = (e: React.PointerEvent) => {
    if (draggedSession && dragStartPos) {
      e.stopPropagation();
      e.preventDefault();
      // Update to absolute mouse position for smooth following
      setDragSessionPosition({ x: e.clientX, y: e.clientY });
    }
  };

  const handleSessionPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Clear long press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    // If we were dragging a session
    if (draggedSession && dragStartPos && dragSessionPosition && onSessionMove) {
      const hourHeight = 60;
      const dayWidth = scrollContainerRef.current ? 
        (scrollContainerRef.current.clientWidth - 56) / 7 : 100; // Subtract time column width
      
      // Calculate day offset (how many days moved)
      const dayOffset = Math.round(dragSessionPosition.x / dayWidth);
      
      // Calculate time offset (in minutes)
      const timeOffsetMinutes = Math.round((dragSessionPosition.y / hourHeight) * 60);
      const snappedTimeOffset = snapTo15Min(timeOffsetMinutes);
      
      // Calculate new date
      const currentDate = new Date(dragStartPos.date);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const newDate = formatDateToLocal(currentDate);
      
      // Calculate new start time
      const newStartMinutes = Math.max(0, Math.min(1440 - draggedSession.durationMinutes, 
        dragStartPos.minutes + snappedTimeOffset));
      const newEndMinutes = newStartMinutes + draggedSession.durationMinutes;
      
      const newStartHour = Math.floor(newStartMinutes / 60);
      const newStartMin = newStartMinutes % 60;
      const newEndHour = Math.floor(newEndMinutes / 60);
      const newEndMin = newEndMinutes % 60;
      
      const newStartTime = `${String(newStartHour).padStart(2, '0')}:${String(newStartMin).padStart(2, '0')}`;
      const newEndTime = `${String(newEndHour).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`;
      
      // Check if position actually changed
      if (newDate !== draggedSession.date || newStartTime !== draggedSession.startTime) {
        onSessionMove(draggedSession, newDate, newStartTime, newEndTime);
      }
      
      // Reset drag state
      setDraggedSession(null);
      setDragSessionPosition(null);
      setDragStartPos(null);
      setDragOffset(null);
      setDraggedSessionSize(null);
    }
    
    // Reset interaction flag after a short delay to prevent accidental creation
    setTimeout(() => {
      setIsInteractingWithSession(false);
    }, 100);
  };

  const handleSessionPointerCancel = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setDraggedSession(null);
    setDragSessionPosition(null);
    setDragStartPos(null);
    setDragOffset(null);
    setDraggedSessionSize(null);
    setIsInteractingWithSession(false);
  };

  // Drag-to-create handlers
  const handleCellMouseDown = (date: Date, e: React.MouseEvent) => {
    // Don't create a new session if we're interacting with an existing session
    if (!onCreateSession || draggedSession || isInteractingWithSession) return;
    
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    const hourHeight = 60;
    const totalMinutes = (y / hourHeight) * 60;
    const snappedMinutes = snapTo15Min(totalMinutes);
    
    const dateStr = formatDateToLocal(date);
    
    setIsDraggingNew(true);
    setDragStart({ date: dateStr, minutes: snappedMinutes });
    setDragCurrent({ minutes: snappedMinutes });
  };

  const handleMouseMove = (_date: Date, e: React.MouseEvent) => {
    if (draggedSession) return; // Don't drag-to-create when moving a session
    if (!isDraggingNew || !dragStart) return;
    
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    const hourHeight = 60;
    const totalMinutes = (y / hourHeight) * 60;
    const snappedMinutes = snapTo15Min(Math.max(0, Math.min(1440, totalMinutes)));
    
    setDragCurrent({ minutes: snappedMinutes });
  };

  const handleMouseUp = () => {
    if (!isDraggingNew || !dragStart || !dragCurrent || !onCreateSession) {
      setIsDraggingNew(false);
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const startMin = Math.min(dragStart.minutes, dragCurrent.minutes);
    const endMin = Math.max(dragStart.minutes, dragCurrent.minutes);
    
    // Ensure minimum duration of 15 minutes
    if (endMin - startMin < 15) {
      // Create 30-minute block from click point
      const adjustedEnd = Math.min(1440, startMin + 30);
      const startHour = Math.floor(startMin / 60);
      const startMinute = startMin % 60;
      const endHour = Math.floor(adjustedEnd / 60);
      const endMinute = adjustedEnd % 60;
      
      const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      
      onCreateSession(dragStart.date, startTime, endTime);
    } else {
      const startHour = Math.floor(startMin / 60);
      const startMinute = startMin % 60;
      const endHour = Math.floor(endMin / 60);
      const endMinute = endMin % 60;
      
      const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      
      onCreateSession(dragStart.date, startTime, endTime);
    }
    
    setIsDraggingNew(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  // Calculate preview position for drag-to-create
  const getPreviewForDate = (date: Date) => {
    if (!isDraggingNew || !dragStart || !dragCurrent) return null;
    
    const dateStr = formatDateToLocal(date);
    if (dragStart.date !== dateStr) return null;
    
    const hourHeight = 60;
    const startMin = Math.min(dragStart.minutes, dragCurrent.minutes);
    const endMin = Math.max(dragStart.minutes, dragCurrent.minutes);
    
    // If duration is less than 15 minutes, show 30-minute preview
    const duration = endMin - startMin;
    const actualEnd = duration < 15 ? Math.min(1440, startMin + 30) : endMin;
    
    const top = (startMin / 60) * hourHeight;
    const height = ((actualEnd - startMin) / 60) * hourHeight;
    
    return { top, height };
  };

  const handlePlusClick = () => {
    if (!onCreateSession) return;
    
    // Create session for today at current time (rounded to next 15 min) with 1 hour duration
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const roundedStart = snapTo15Min(currentMinutes);
    const roundedEnd = roundedStart + 60; // 1 hour default
    
    const startHour = Math.floor(roundedStart / 60);
    const startMinute = roundedStart % 60;
    const endHour = Math.floor(roundedEnd / 60);
    const endMinute = roundedEnd % 60;
    
    const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    const dateStr = formatDateToLocal(now);
    
    console.log('🎯 Creating session from calendar drag:', {
      dateObject: now.toString(),
      dateStr,
      startTime,
      endTime
    });
    
    onCreateSession(dateStr, startTime, endTime);
  };

  return (
    <Card className="overflow-hidden flex flex-col lg:h-full relative">
      <CardHeader className="pb-3 border-b flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Title */}
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Woche {weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })} - {weekDays[6].toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </CardTitle>
          
          {/* Week navigation */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToWeek(currentWeekOffset - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
            >
              Heute
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToWeek(currentWeekOffset + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Export/Import buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {}}
              title="Kalender exportieren (demnächst verfügbar)"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {}}
              title="Externe Kalender importieren (demnächst verfügbar)"
            >
              <Upload className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 relative overflow-hidden">
        <div 
          ref={scrollContainerRef}
          className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
          style={{ 
            cursor: isDraggingNew ? 'crosshair' : 'default',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <motion.div
            drag={isMobile && !draggedSession && !isDraggingNew ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x }}
            className="min-w-full"
          >
            <div className="flex border-t border-gray-200 relative">
              {/* Time column */}
              <div className="w-14 flex-shrink-0 border-r border-gray-200 bg-gray-50">
                {/* Header spacer */}
                <div className="h-12 border-b border-gray-200 sticky top-0 z-40 bg-gray-50"></div>
                
                {/* Time labels */}
                <div className="relative">
                  {allHours.map((hour) => (
                    <div
                      key={hour}
                      className="h-[60px] relative border-t-2 border-gray-300 first:border-t-0"
                    >
                      {hour > 0 && (
                        <div className="absolute -top-2.5 left-1 right-1 text-xs text-gray-500 bg-gray-50 text-center">
                          {hour.toString().padStart(2, '0')}:00
                        </div>
                      )}
                      {/* 15-minute markers */}
                      <div className="absolute top-[15px] left-0 right-0 h-px bg-gray-100"></div>
                      <div className="absolute top-[30px] left-0 right-0 h-px bg-gray-200"></div>
                      <div className="absolute top-[45px] left-0 right-0 h-px bg-gray-100"></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day columns */}
              <div className="flex-1 grid grid-cols-7 relative">
                {weekDays.map((date, dayIdx) => {
                  const daySessions = getSessionsForDay(date);
                  const header = formatDayHeader(date);
                  const preview = getPreviewForDate(date);
                  
                  return (
                    <div 
                      key={dayIdx} 
                      className={`border-r border-gray-200 relative ${isToday(date) ? 'bg-blue-50/20' : ''}`}
                    >
                      {/* Day header - sticky */}
                      <div className={`h-12 border-b border-gray-200 flex flex-col items-center justify-center sticky top-0 z-40 bg-white ${
                        isToday(date) ? 'border-b-2 border-b-blue-500' : ''
                      }`}>
                        <span className={`text-xs uppercase ${isToday(date) ? 'text-blue-600' : 'text-gray-600'}`}>
                          {header.day}
                        </span>
                        <span className={`${isToday(date) ? 'text-blue-600' : 'text-gray-900'}`}>
                          {date.getDate()}
                        </span>
                      </div>

                      {/* Hour cells - background grid */}
                      <div 
                        className="relative select-none" 
                        onMouseDown={(e) => handleCellMouseDown(date, e)}
                        onMouseMove={(e) => handleMouseMove(date, e)}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={() => {
                          if (isDraggingNew) handleMouseUp();
                        }}
                        style={{ cursor: onCreateSession ? (isDraggingNew ? 'crosshair' : 'pointer') : 'default' }}
                      >
                        {allHours.map((hour) => (
                          <div
                            key={hour}
                            className="h-[60px] border-t-2 border-gray-300 first:border-t-0 relative"
                          >
                            {/* 15-minute grid lines */}
                            <div className="absolute top-[15px] left-0 right-0 h-px bg-gray-50"></div>
                            <div className="absolute top-[30px] left-0 right-0 h-px bg-gray-100"></div>
                            <div className="absolute top-[45px] left-0 right-0 h-px bg-gray-50"></div>
                          </div>
                        ))}

                        {/* Sessions */}
                        {daySessions.map((session) => {
                          const pos = calculateSessionPosition(session, date);
                          const isDragging = draggedSession?.id === session.id;
                          
                          // Check if session has valid endTime
                          let needsEvaluation = false;
                          if (session.endTime && !session.completed) {
                            try {
                              // Create datetime for session end in local timezone
                              // Use endDate if available (for multi-day sessions), otherwise use date
                              const endDateStr = session.endDate || session.date;
                              const [year, month, day] = endDateStr.split('-').map(Number);
                              const [endHour, endMinute] = session.endTime.split(':').map(Number);
                              const sessionEndDate = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
                              const now = new Date();
                              needsEvaluation = sessionEndDate.getTime() < now.getTime();
                            } catch (e) {
                              console.error('Error parsing session time:', session);
                            }
                          }
                          
                          return (
                            <div
                              key={session.id}
                              className={`rounded border-2 px-1.5 py-1 cursor-pointer hover:shadow-md ${getSessionColor(session)} ${isDragging ? 'shadow-2xl' : 'transition-shadow'}`}
                              style={
                                isDragging && dragSessionPosition && dragOffset && draggedSessionSize ? {
                                  // When dragging, use fixed positioning to follow cursor exactly
                                  position: 'fixed',
                                  left: `${dragSessionPosition.x - dragOffset.x}px`,
                                  top: `${dragSessionPosition.y - dragOffset.y}px`,
                                  width: `${draggedSessionSize.width}px`,
                                  height: `${draggedSessionSize.height}px`,
                                  zIndex: 9999,
                                  pointerEvents: 'none', // Don't block mouse events while dragging
                                  touchAction: 'none',
                                  opacity: 0.9,
                                } : {
                                  // Normal positioning
                                  position: 'absolute',
                                  left: '4px',
                                  right: '4px',
                                  top: `${pos.top}px`,
                                  height: `${pos.height}px`,
                                  zIndex: 10,
                                  touchAction: 'none',
                                }
                              }
                              onPointerDown={(e) => handleSessionPointerDown(session, date, e)}
                              onPointerMove={handleSessionPointerMove}
                              onPointerUp={handleSessionPointerUp}
                              onPointerCancel={handleSessionPointerCancel}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Only trigger click if we're not dragging
                                if (!draggedSession) {
                                  onSessionClick(session);
                                }
                              }}
                            >
                              <div className="text-xs leading-tight break-words">{getCourseName(session.courseId)}</div>
                              <div className="text-[10px] opacity-75">
                                {(() => {
                                  if (session.endDate && session.endDate !== session.date) {
                                    const sessionStart = new Date(session.date);
                                    const sessionEnd = new Date(session.endDate);
                                    const currentDateOnly = new Date(date);
                                    sessionStart.setHours(0, 0, 0, 0);
                                    sessionEnd.setHours(0, 0, 0, 0);
                                    currentDateOnly.setHours(0, 0, 0, 0);
                                    
                                    if (currentDateOnly.getTime() === sessionStart.getTime()) {
                                      return `${session.startTime} - 24:00`;
                                    } else if (currentDateOnly.getTime() === sessionEnd.getTime()) {
                                      return `00:00 - ${session.endTime}`;
                                    } else {
                                      return `00:00 - 24:00`;
                                    }
                                  }
                                  return `${session.startTime} - ${session.endTime}`;
                                })()}
                              </div>
                              {needsEvaluation && (
                                <div className="text-[10px] text-red-600 mt-0.5">Bewerten</div>
                              )}
                            </div>
                          );
                        })}

                        {/* Drag preview */}
                        {preview && (
                          <div
                            className="absolute left-1 right-1 rounded border-2 border-dashed border-blue-400 bg-blue-100/50 z-[5] pointer-events-none"
                            style={{
                              top: `${preview.top}px`,
                              height: `${preview.height}px`,
                            }}
                          />
                        )}
                      </div>

                      {/* Current time indicator */}
                      {isToday(date) && isCurrentWeek && (() => {
                        const { position, isVisible } = getCurrentTimePosition();
                        return isVisible ? (
                          <div
                            className="absolute left-0 right-0 z-30 pointer-events-none"
                            style={{ top: `${position + 48}px` }}
                          >
                            <div className="flex items-center">
                              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                              <div className="flex-1 h-0.5 bg-red-500"></div>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
        
        {/* Floating Plus Button */}
        {onCreateSession && (
          <Button
            onClick={handlePlusClick}
            size="lg"
            className="absolute bottom-4 right-4 rounded-full w-14 h-14 shadow-lg z-40"
          >
            <Plus className="w-6 h-6" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
