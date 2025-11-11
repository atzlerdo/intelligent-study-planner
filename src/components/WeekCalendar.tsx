import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar as CalendarPicker } from './ui/calendar';
import type { ScheduledSession, Course } from '../types';
import { motion, useMotionValue, animate } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { CalendarSync } from './CalendarSync';
import { GoogleCalendarSyncService } from './GoogleCalendarSyncService';
import type { PanInfo } from 'motion/react';
import { useIsMobile } from './ui/use-mobile';
import { de } from 'date-fns/locale';
import { expandSessionInstances } from '../lib/googleCalendar';

interface WeekCalendarProps {
  sessions: ScheduledSession[];
  courses: Course[];
  onSessionClick: (session: ScheduledSession) => void;
  onCreateSession?: (date: string, startTime: string, endTime: string) => void;
  onSessionMove?: (session: ScheduledSession, newDate: string, newStartTime: string, newEndTime: string) => void;
  // Google Calendar sync plumbing
  onSessionsImported?: (sessions: ScheduledSession[]) => void;
  autoSyncTrigger?: number;
  // Preview session for live editing
  previewSession?: ScheduledSession | null;
  editingSessionId?: string | null; // ID of session being edited (to hide original)
  isDialogOpen?: boolean; // Whether any dialog is open (to prevent drag gestures)
}

export function WeekCalendar({ sessions, courses, onSessionClick, onCreateSession, onSessionMove, onSessionsImported, autoSyncTrigger, previewSession, /* editingSessionId unused */ isDialogOpen }: WeekCalendarProps) {
  const isMobile = useIsMobile();
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const x = useMotionValue(0);
  // Require an explicit fresh pointer down after dialogs close before horizontal week drag is re-enabled.
  // This prevents accidental horizontal panning when a dialog is dismissed with Escape and the user moves the mouse.
  const [dragArmed, setDragArmed] = useState(false);
  
  // Calendar picker state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
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
  
  // Track when dialog was last closed to prevent accidental week navigation
  const lastDialogCloseTime = useRef<number>(0);
  const isDialogRecentlyClosed = () => Date.now() - lastDialogCloseTime.current < 300; // 300ms cooldown

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Track when dialog closes to prevent accidental drag navigation
  useEffect(() => {
    if (!isDialogOpen) {
      // Dialog just closed, record the time
      lastDialogCloseTime.current = Date.now();
      // Disarm drag until a new pointer down occurs
      setDragArmed(false);
    }
  }, [isDialogOpen]);

  // Global pointer move listener for smooth dragging
  useEffect(() => {
    if (!draggedSession || isDialogOpen) return;

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
  // Preserve scroll position across week changes so users maintain consistent timeline view
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null);

  // Check if we're viewing the current week
  const isCurrentWeek = currentWeekOffset === 0;

  // Reset drag position and states when dialog opens to prevent week jumping and drag interactions
  useEffect(() => {
    if (isDialogOpen) {
      x.set(0);
      // Clear any ongoing drag operations
      setDraggedSession(null);
      setDragSessionPosition(null);
      setDragStartPos(null);
      setDragOffset(null);
      setDraggedSessionSize(null);
      setIsDraggingNew(false);
      setDragStart(null);
      setDragCurrent(null);
      // While dialog open, ensure drag is not armed
      setDragArmed(false);
    }
  }, [isDialogOpen, x]);

  // Auto-scroll to current time on mount and week change with 2-hour buffer
  useEffect(() => {
    if (scrollContainerRef.current && isCurrentWeek) {
      if (savedScrollPosition !== null && !isInitialMount) {
        // Restore saved scroll position when returning to a week
        scrollContainerRef.current.scrollTo({
          top: savedScrollPosition,
          behavior: 'smooth'
        });
      } else {
        // First mount or no saved position: scroll to current time
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
      }
      
      if (isInitialMount) setIsInitialMount(false);
    } else if (scrollContainerRef.current && !isCurrentWeek) {
      // For non-current weeks, restore saved scroll position or use previous week's scroll
      if (savedScrollPosition !== null) {
        scrollContainerRef.current.scrollTo({
          top: savedScrollPosition,
          behavior: isInitialMount ? 'auto' : 'smooth'
        });
      } else {
        // Default to 6am for first visit
        const hourHeight = 60;
        const defaultScroll = 6 * hourHeight;
        scrollContainerRef.current.scrollTo({
          top: defaultScroll,
          behavior: isInitialMount ? 'auto' : 'smooth'
        });
      }
      
      if (isInitialMount) setIsInitialMount(false);
    }
  }, [currentWeekOffset, isCurrentWeek, isMobile, isInitialMount, savedScrollPosition]);

  const allHours = Array.from({ length: 24 }, (_, i) => i);

  // Get ISO week number (ISO 8601 standard)
  const getWeekNumber = (date: Date): number => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  };

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
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekStart]);

  // Expand recurring sessions to instances within the current week window
  const sessionsExpandedForWeek = useMemo(() => {
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(weekEnd);
    const expanded: ScheduledSession[] = [];
    for (const s of sessions) {
      if (s.recurrence) {
        const instances = expandSessionInstances(s, start, end);
        expanded.push(...instances);
      } else {
        expanded.push(s);
      }
    }
    // Deduplicate by id keeping latest lastModified
    const byId = new Map<string, ScheduledSession>();
    for (const s of expanded) {
      const prev = byId.get(s.id);
      if (!prev || (s.lastModified || 0) >= (prev.lastModified || 0)) {
        byId.set(s.id, s);
      }
    }
    const result = Array.from(byId.values());
    // Debug: count expanded vs original
    try {
      const recurringCount = sessions.filter(s => !!s.recurrence).length;
      console.log('🧩 Week expansion:', {
        weekStart: start.toISOString().split('T')[0],
        weekEnd: end.toISOString().split('T')[0],
        inputSessions: sessions.length,
        recurringMasters: recurringCount,
        outputInstances: result.length
      });
    } catch {}
    return result;
  }, [sessions, weekStart, weekEnd]);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  const getSessionsForDay = (date: Date): ScheduledSession[] => {
    const dateStr = formatDateToLocal(date);
    
    // Use week-expanded sessions when filtering per day
    const uniqueSessions = sessionsExpandedForWeek;
    
    let filteredSessions = uniqueSessions.filter(s => {
      // Keep the session visible even when editing (don't hide the original)
      // The preview system will handle showing changes if needed
      
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
    
    // Add preview session if it belongs to this day
    if (previewSession) {
      if (previewSession.date === dateStr) {
        // Remove the original session with the same id to avoid duplicates when previewing
        filteredSessions = filteredSessions.filter(s => s.id !== previewSession.id);
        filteredSessions.push(previewSession);
      } else if (previewSession.endDate && previewSession.endDate !== previewSession.date) {
        const sessionStart = new Date(previewSession.date);
        const sessionEnd = new Date(previewSession.endDate);
        const currentDate = new Date(dateStr);
        
        sessionStart.setHours(0, 0, 0, 0);
        sessionEnd.setHours(0, 0, 0, 0);
        currentDate.setHours(0, 0, 0, 0);
        
        if (currentDate >= sessionStart && currentDate <= sessionEnd) {
          // Remove the original session with the same id to avoid duplicates when previewing
          filteredSessions = filteredSessions.filter(s => s.id !== previewSession.id);
          filteredSessions.push(previewSession);
        }
      }
    }
    // Debug: List sessions for the day including expanded ones
    try {
      console.log('🗓️ Day sessions after expansion:', {
        day: dateStr,
        count: filteredSessions.length,
        ids: filteredSessions.map(s => s.id)
      });
    } catch {}
    
    return filteredSessions;
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

  const getCourseName = (courseId?: string): string => {
    if (!courseId) return 'Unassigned Session'; // Blocker/unassigned session
    return courses.find(c => c.id === courseId)?.name || 'Kurs';
  };

  const getSessionColor = (session: ScheduledSession): string => {
    // Unassigned sessions (blockers) - neutral gray styling
    if (!session.courseId) {
      return 'bg-gray-100 border-gray-400 text-gray-700 shadow-sm';
    }
    
    if (session.completed) {
      // Check if this was attended (has completionPercentage > 0) or not attended
      if (session.completionPercentage && session.completionPercentage > 0) {
        return 'bg-green-50 border-green-500 text-green-900 shadow-sm';
      } else {
        return 'bg-gray-100 border-gray-400 text-gray-600 shadow-sm';
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
        return 'bg-red-50 border-red-500 text-red-900 shadow-sm';
      }
    } catch (error) {
      // If parsing fails, treat as future session
      console.error('❌ Error parsing session date/time:', error, session);
      return 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm';
    }
    
    // Planned future session - modern blue instead of yellow
    return 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm';
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Don't change week if drag was disabled (dialog open, session interaction, etc.)
    if (draggedSession || isDraggingNew || isInteractingWithSession || isDialogOpen || isDialogRecentlyClosed()) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
      return;
    }
    
    // Only change week if there was actual dragging motion (velocity > threshold)
    // This prevents accidental week changes from simple clicks
    const velocityThreshold = 50; // pixels/second
    const distanceThreshold = 100; // pixels
    const hasSignificantVelocity = Math.abs(info.velocity.x) > velocityThreshold;
    const hasSignificantDistance = Math.abs(info.offset.x) > distanceThreshold;
    
    // Require either significant velocity OR distance to change weeks
    if (hasSignificantVelocity || hasSignificantDistance) {
      if (info.offset.x > distanceThreshold) {
        setCurrentWeekOffset(currentWeekOffset - 1);
      } else if (info.offset.x < -distanceThreshold) {
        setCurrentWeekOffset(currentWeekOffset + 1);
      }
    }
    
    animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
  };

  const goToWeek = (offset: number) => {
    // Save current scroll position before changing weeks
    if (scrollContainerRef.current) {
      setSavedScrollPosition(scrollContainerRef.current.scrollTop);
    }
    setCurrentWeekOffset(offset);
  };

  const goToToday = () => {
    // Save current scroll position before changing weeks
    if (scrollContainerRef.current) {
      setSavedScrollPosition(scrollContainerRef.current.scrollTop);
    }
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
    return Math.round(minutes / 15) * 15;
  };

  // Session drag handlers
  const handleSessionPointerDown = (session: ScheduledSession, date: Date, e: React.PointerEvent) => {
    // Prevent any drag interaction when a dialog is open
    if (isDialogOpen) {
      return;
    }
    
    e.stopPropagation();
    setIsInteractingWithSession(true);

    // Determine pointer type; touchpads often report as 'mouse'. We require movement threshold for mouse.
    const pointerType = (e.nativeEvent as PointerEvent).pointerType;
    const isMouse = pointerType === 'mouse' || pointerType === '';

    // Clear any existing long press
    if (longPressTimer) {
      clearTimeout(longPressTimer as number);
      setLongPressTimer(null);
    }

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const target = e.currentTarget as HTMLElement;

    const initiateDrag = (currentX: number, currentY: number) => {
      if (!onSessionMove) return;
      // Get fresh rect at drag initiation
      const rect = target.getBoundingClientRect();
      const dateStr = formatDateToLocal(date);
      const [startHour, startMin] = session.startTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      
      // Calculate the offset at the current moment to ensure it matches where finger/cursor is
      const currentOffsetX = currentX - rect.left;
      const currentOffsetY = currentY - rect.top;
      
      setDraggedSession(session);
      // Use the current offset to maintain cursor position relative to element
      setDragOffset({ x: currentOffsetX, y: currentOffsetY });
      setDraggedSessionSize({ width: rect.width, height: rect.height });
      setDragStartPos({ x: currentX, y: currentY, date: dateStr, minutes: startMinutes });
      setDragSessionPosition({ x: currentX, y: currentY });
    };

    if (isMouse) {
      // Movement threshold approach for mouse/touchpad
      const moveListener = (moveEvent: PointerEvent) => {
        const dx = Math.abs(moveEvent.clientX - startClientX);
        const dy = Math.abs(moveEvent.clientY - startClientY);
        const threshold = 6; // px movement to initiate drag
        if (dx > threshold || dy > threshold) {
          initiateDrag(moveEvent.clientX, moveEvent.clientY);
          target.removeEventListener('pointermove', moveListener as unknown as EventListener);
        }
      };
      target.addEventListener('pointermove', moveListener, { passive: true });
      const cleanup = () => {
        target.removeEventListener('pointermove', moveListener as unknown as EventListener);
        target.removeEventListener('pointerup', cleanup as unknown as EventListener);
        target.removeEventListener('pointercancel', cleanup as unknown as EventListener);
      };
      target.addEventListener('pointerup', cleanup, { once: true });
      target.addEventListener('pointercancel', cleanup, { once: true });
    } else {
      // Touch / pen: keep long press semantics with slightly longer delay to avoid accidental drags
      const timer = window.setTimeout(() => {
        initiateDrag(startClientX, startClientY);
      }, 300);
      setLongPressTimer(timer);
    }
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
      
      // Calculate day offset (how many days moved) relative to drag start position
      const dayOffset = Math.round((dragSessionPosition.x - dragStartPos.x) / dayWidth);
      
      // Calculate time offset (in minutes) relative to drag start position
      const timeOffsetMinutes = Math.round(((dragSessionPosition.y - dragStartPos.y) / hourHeight) * 60);
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
    // Don't create a new session if we're interacting with an existing session or a dialog is open
    if (!onCreateSession || draggedSession || isInteractingWithSession || isDialogOpen) return;
    
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    const hourHeight = 60;
    const totalMinutes = (y / hourHeight) * 60;
    // Use floor for start - snaps to grid line above the click
    const snappedMinutes = Math.floor(totalMinutes / 15) * 15;
    
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
    // Use round for end - snaps to nearest grid line while dragging
    const snappedMinutes = Math.round(Math.max(0, Math.min(1440, totalMinutes)) / 15) * 15;
    
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

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);

  return (
    <>
      {/* Background sync service - always mounted to handle auto-sync */}
      <GoogleCalendarSyncService
        sessions={sessions}
        courses={courses}
        onSessionsImported={onSessionsImported}
        autoSyncTrigger={autoSyncTrigger}
        onStateChange={({ isConnected, isSyncing }) => {
          setGoogleConnected(isConnected);
          setGoogleSyncing(isSyncing);
        }}
      />
      
      <Card className="overflow-hidden flex flex-col lg:h-full relative">
      <CardHeader className="py-3 border-b flex-shrink-0 flex flex-wrap items-start justify-between gap-3">
          {/* Week navigation + mobile month below */}
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToWeek(currentWeekOffset - 1)}
              className="hidden lg:inline-flex hover:bg-gray-100 hover:border-gray-400 shadow-none h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="font-semibold hover:bg-gray-100 hover:border-gray-400 shadow-none h-8 px-3"
            >
              Heute
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToWeek(currentWeekOffset + 1)}
              className="hidden lg:inline-flex hover:bg-gray-100 hover:border-gray-400 shadow-none h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {/* Mobile month name (below controls) */}
            <CardTitle className="lg:hidden text-lg font-bold mt-1 w-full text-center">
              {weekStart.toLocaleDateString('de-DE', { month: 'long' })}
            </CardTitle>
          </div>
          
          {/* Month name - centered and prominent */}
          <div className="hidden lg:flex flex-1 items-center justify-center">
            <CardTitle className="text-xl sm:text-2xl font-bold">
              {weekStart.toLocaleDateString('de-DE', { month: 'long' })}
            </CardTitle>
          </div>
          
          {/* Google Sync Icon */}
          <div className="hidden lg:flex gap-2 items-center">
            {/* Google Calendar Sync Icon Button (Dialog trigger) */}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  title="Google Kalender Synchronisation"
                  className="relative hover:bg-gray-100 hover:border-gray-400 shadow-none"
                >
                  {/* Google logo + dynamic status indicator */}
                  <span className="relative flex items-center justify-center w-5 h-5">
                    {/* Official Google "G" logo SVG */}
                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {/* Status indicator dot */}
                    {!googleSyncing && (
                      <span
                        className={`absolute -right-1 -top-1 w-3 h-3 rounded-full border border-white shadow-sm ${googleConnected ? 'bg-green-500' : 'bg-red-500'}`}
                        aria-label={googleConnected ? 'Verbunden' : 'Nicht verbunden'}
                      />
                    )}
                    {googleSyncing && (
                      <RefreshCw className="absolute -right-2 -top-2 w-4 h-4 animate-spin text-blue-500" />
                    )}
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Google Kalender Synchronisation</DialogTitle>
                </DialogHeader>
                {/* CalendarSync component for UI only - background service handles auto-sync */}
                <CalendarSync
                  sessions={sessions}
                  courses={courses}
                  onSessionsImported={onSessionsImported}
                  autoSyncTrigger={0}
                  onStateChange={({ isConnected, isSyncing }) => {
                    setGoogleConnected(isConnected);
                    setGoogleSyncing(isSyncing);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 relative overflow-hidden">
        <div 
          ref={scrollContainerRef}
          className="h-full max-h-[360px] lg:max-h-none overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
          style={{ 
            cursor: isDraggingNew ? 'crosshair' : 'default',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y' // Only allow vertical scrolling, prevent horizontal swipe
          }}
        >
          <motion.div
            // Only allow horizontal drag when we explicitly armed it via a fresh pointer down.
            drag={!draggedSession && !isDraggingNew && !isInteractingWithSession && !isDialogOpen && !isDialogRecentlyClosed() && dragArmed ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            onPointerDown={() => {
              // Ignore if a dialog is open or just closed (cooldown) or already armed.
              if (isDialogOpen || isDialogRecentlyClosed() || dragArmed) return;
              // If the pointer down originated from an interactive session element we don't arm global drag here.
              // We detect by checking for data-session or closest with our session classes; simpler: rely on stopPropagation in session handlers.
              setDragArmed(true);
            }}
            style={{ x }}
            className="min-w-full h-full"
          >
            <div className="flex border-t border-gray-200 relative h-full">
              {/* Time column */}
              <div className="w-14 flex-shrink-0 border-r-2 border-gray-300 bg-gray-50/50">
                {/* Header with calendar icon */}
                <div className="h-12 border-b-2 border-gray-300 sticky top-0 z-40 bg-white shadow-sm flex items-center justify-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="hover:bg-gray-100 shadow-none p-0 h-10 w-12">
                        <div className="flex flex-col w-full h-full rounded-md overflow-hidden border border-gray-300">
                          {/* Gray header bar with year */}
                          <div className="h-3 bg-gray-400 flex-shrink-0 flex items-center justify-center">
                            <span className="text-[8px] font-semibold text-white">{weekStart.getFullYear()}</span>
                          </div>
                          {/* White body with week number */}
                          <div className="flex-1 bg-white flex items-center justify-center">
                            <span className="text-base font-bold text-gray-800">{getWeekNumber(weekStart)}</span>
                          </div>
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0 bg-white" align="start">
                      {showMonthPicker ? (
                        <div className="p-4 bg-white">
                          <div className="grid grid-cols-3 gap-2">
                            {['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'].map((month, idx) => (
                              <button
                                key={month}
                                type="button"
                                onClick={() => {
                                  const newDate = new Date(calendarDate);
                                  newDate.setMonth(idx);
                                  setCalendarDate(newDate);
                                  setShowMonthPicker(false);
                                }}
                                className={`px-3 py-2 rounded hover:bg-gray-100 text-sm ${
                                  calendarDate.getMonth() === idx ? 'bg-blue-500 text-white hover:bg-blue-600' : ''
                                }`}
                              >
                                {month}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : showYearPicker ? (
                        <div className="p-4 bg-white">
                          <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                            {Array.from({ length: 20 }, (_, i) => calendarDate.getFullYear() - 10 + i).map((year) => (
                              <button
                                key={year}
                                type="button"
                                onClick={() => {
                                  const newDate = new Date(calendarDate);
                                  newDate.setFullYear(year);
                                  setCalendarDate(newDate);
                                  setShowYearPicker(false);
                                }}
                                className={`px-2 py-1 rounded hover:bg-gray-100 text-sm ${
                                  calendarDate.getFullYear() === year ? 'bg-blue-500 text-white hover:bg-blue-600' : ''
                                }`}
                              >
                                {year}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-white">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  const newDate = new Date(calendarDate);
                                  newDate.setMonth(calendarDate.getMonth() - 1);
                                  setCalendarDate(newDate);
                                }}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              <button
                                type="button"
                                onClick={() => setShowMonthPicker(true)}
                                className="text-sm font-medium hover:bg-gray-100 px-2 py-0.5 rounded min-w-[60px]"
                              >
                                {['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][calendarDate.getMonth()]}
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  const newDate = new Date(calendarDate);
                                  newDate.setMonth(calendarDate.getMonth() + 1);
                                  setCalendarDate(newDate);
                                }}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  const newDate = new Date(calendarDate);
                                  newDate.setFullYear(calendarDate.getFullYear() - 1);
                                  setCalendarDate(newDate);
                                }}
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </Button>
                              <button
                                type="button"
                                onClick={() => setShowYearPicker(true)}
                                className="text-xs font-medium hover:bg-gray-100 px-2 py-0.5 rounded"
                              >
                                {calendarDate.getFullYear()}
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  const newDate = new Date(calendarDate);
                                  newDate.setFullYear(calendarDate.getFullYear() + 1);
                                  setCalendarDate(newDate);
                                }}
                              >
                                <ChevronRight className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="mx-auto" style={{width: 'max-content'}}>
                            <CalendarPicker
                            mode="single"
                            selected={undefined}
                            month={calendarDate}
                            onMonthChange={setCalendarDate}
                            hideNavigation={true}
                            onSelect={(selectedDate) => {
                              if (selectedDate) {
                                // Calculate week offset from selected date
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const selectedDay = selectedDate.getDay();
                                const selectedMonday = new Date(selectedDate);
                                selectedMonday.setDate(selectedDate.getDate() - selectedDay + (selectedDay === 0 ? -6 : 1));
                                
                                const todayDay = today.getDay();
                                const todayMonday = new Date(today);
                                todayMonday.setDate(today.getDate() - todayDay + (todayDay === 0 ? -6 : 1));
                                
                                const diffTime = selectedMonday.getTime() - todayMonday.getTime();
                                const diffWeeks = Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));
                                
                                goToWeek(diffWeeks);
                              }
                            }}
                            locale={de}
                          />
                          </div>
                        </div>
                        
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Time labels */}
                <div className="relative">
                  {allHours.map((hour) => (
                    <div
                      key={hour}
                      className="h-[60px] relative border-t border-gray-200 first:border-t-0"
                    >
                      {hour > 0 && (
                        <div className="absolute -top-2.5 left-1 right-1 text-xs font-medium text-gray-600 bg-gray-50/50 text-center">
                          {hour.toString().padStart(2, '0')}:00
                        </div>
                      )}
                      {/* 15-minute markers - lighter */}
                      <div className="absolute top-[15px] left-0 right-0 h-px bg-gray-100"></div>
                      <div className="absolute top-[30px] left-0 right-0 h-px bg-gray-150"></div>
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
                      className={`border-r border-gray-200 relative ${isToday(date) ? 'bg-blue-50/30' : ''}`}
                    >
                      {/* Day header - sticky */}
                      <div className={`h-12 border-b-2 flex flex-col items-center justify-center sticky top-0 z-40 bg-white shadow-sm ${
                        isToday(date) ? 'border-b-blue-500' : 'border-b-gray-300'
                      }`}>
                        <span className={`text-xs font-semibold uppercase ${isToday(date) ? 'text-blue-600' : 'text-gray-500'}`}>
                          {header.day}
                        </span>
                        <span className={`text-lg font-bold ${isToday(date) ? 'text-blue-600' : 'text-gray-900'}`}>
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
                            className="h-[60px] border-t border-gray-200 first:border-t-0 relative hover:bg-gray-50/50 transition-colors"
                          >
                            {/* 15-minute grid lines - subtler */}
                            <div className="absolute top-[15px] left-0 right-0 h-px bg-gray-100"></div>
                            <div className="absolute top-[30px] left-0 right-0 h-px bg-gray-150"></div>
                            <div className="absolute top-[45px] left-0 right-0 h-px bg-gray-100"></div>
                          </div>
                        ))}

                        {/* Drag-to-create preview */}
                        {isDraggingNew && dragStart && dragCurrent && formatDateToLocal(date) === dragStart.date && (
                          <div
                            className="absolute left-1 right-1 bg-blue-300/40 border-2 border-blue-400 border-dashed rounded-lg pointer-events-none z-20"
                            style={{
                              top: `${Math.min(dragStart.minutes, dragCurrent.minutes)}px`,
                              height: `${Math.abs(dragCurrent.minutes - dragStart.minutes)}px`,
                            }}
                          >
                            <div className="text-xs text-blue-700 font-medium p-1">
                              New Session
                            </div>
                          </div>
                        )}

                        {/* Sessions */}
                        {daySessions.map((session) => {
                          const pos = calculateSessionPosition(session, date);
                          const isDragging = draggedSession?.id === session.id;
                          // Only mark the actual preview object as preview (by reference),
                          // not any other session with the same id. This prevents duplicate keys/rendering.
                          const isPreview = !!previewSession && session === previewSession;
                          // ...existing session rendering logic...
                          let needsEvaluation = false;
                          if (session.endTime && !session.completed) {
                            try {
                              const endDateStr = session.endDate || session.date;
                              const [year, month, day] = endDateStr.split('-').map(Number);
                              const [endHour, endMinute] = session.endTime.split(':').map(Number);
                              const sessionEndDate = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
                              const now = new Date();
                              needsEvaluation = sessionEndDate.getTime() < now.getTime();
                            } catch {
                              console.error('Error parsing session time:', session);
                            }
                          }
                          const keyPrefix = isPreview ? 'preview' : 'session';
                          const dateStr = formatDateToLocal(date);
                          const uniqueKey = `${keyPrefix}-${session.id}-${dateStr}`;
                          return (
                            <div
                              key={uniqueKey}
                              className={`rounded-lg border px-2 py-1.5 ${isPreview ? 'pointer-events-none' : 'cursor-pointer hover:shadow-lg'} transition-all ${getSessionColor(session)}`}
                              style={{
                                position: 'absolute',
                                left: '4px',
                                right: '4px',
                                top: `${pos.top}px`,
                                height: `${pos.height}px`,
                                zIndex: isPreview ? 20 : 10,
                                touchAction: 'none',
                                opacity: (isDragging || isPreview) && !needsEvaluation ? 0.5 : 1,
                              }}
                              onPointerDown={(e) => handleSessionPointerDown(session, date, e)}
                              onPointerMove={handleSessionPointerMove}
                              onPointerUp={handleSessionPointerUp}
                              onPointerCancel={handleSessionPointerCancel}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!draggedSession) {
                                  onSessionClick(session);
                                }
                              }}
                            >
                              <div className="text-xs leading-tight font-medium break-words">{getCourseName(session.courseId)}</div>
                              {needsEvaluation && (
                                <div className="text-[10px] text-red-600 mt-0.5">Bewerten</div>
                              )}
                            </div>
                          );
                        })}

                        {/* Drag preview for creating new session */}
                        {preview && (
                          <div
                            className="absolute left-1 right-1 rounded-lg border border-blue-500 bg-blue-100/80 z-[5] pointer-events-none shadow-md"
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
        
        {/* Mobile Google Sync Button removed from overlay; will render under the calendar on mobile */}

        {/* Floating Plus Button - hidden on mobile */}
        {onCreateSession && (
          <Button
            onClick={handlePlusClick}
            size="lg"
            className="hidden lg:flex absolute bottom-4 right-4 rounded-full w-16 h-16 shadow-2xl hover:shadow-3xl z-50 bg-blue-600 hover:bg-blue-700 transition-all hover:scale-110 active:scale-95"
          >
            <Plus className="w-8 h-8 text-white stroke-[3]" />
          </Button>
        )}
      </CardContent>
    </Card>
    {/* Mobile Google Sync under the calendar */}
    <div className="mt-3 flex lg:hidden justify-end">
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="default"
            title="Google Kalender Synchronisation"
            className="relative shadow-sm hover:bg-gray-100 hover:border-gray-400"
          >
            <span className="relative flex items-center gap-2">
              <span className="relative flex items-center justify-center w-5 h-5">
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {!googleSyncing && (
                  <span
                    className={`absolute -right-1 -top-1 w-3 h-3 rounded-full border border-white shadow-sm ${googleConnected ? 'bg-green-500' : 'bg-red-500'}`}
                    aria-label={googleConnected ? 'Verbunden' : 'Nicht verbunden'}
                  />
                )}
                {googleSyncing && (
                  <RefreshCw className="absolute -right-2 -top-2 w-4 h-4 animate-spin text-blue-500" />
                )}
              </span>
              <span className="text-sm font-medium">Google Sync</span>
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Google Kalender Synchronisation</DialogTitle>
          </DialogHeader>
          <CalendarSync
            sessions={sessions}
            courses={courses}
            onSessionsImported={onSessionsImported}
            autoSyncTrigger={0}
            onStateChange={() => {}}
          />
        </DialogContent>
      </Dialog>
    </div>
    
    {/* Drag preview for moving sessions - rendered outside calendar to follow cursor */}
    {draggedSession && dragSessionPosition && dragOffset && draggedSessionSize && (
      <div
        className={`fixed rounded-lg border px-2 py-1.5 shadow-2xl scale-105 pointer-events-none ${getSessionColor(draggedSession)}`}
        style={{
          left: `${dragSessionPosition.x - dragOffset.x}px`,
          top: `${dragSessionPosition.y - dragOffset.y}px`,
          width: `${draggedSessionSize.width}px`,
          height: `${draggedSessionSize.height}px`,
          zIndex: 9999,
          opacity: 0.9,
        }}
      >
        <div className="text-xs leading-tight font-medium break-words">{getCourseName(draggedSession.courseId)}</div>
      </div>
    )}
    </>
  );
}
