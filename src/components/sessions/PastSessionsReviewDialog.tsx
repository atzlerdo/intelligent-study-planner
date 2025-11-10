import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { AlertCircle, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { ScheduledSession, Course } from '../../types';
import { ScrollArea } from '../ui/scroll-area';

interface PastSessionsReviewDialogProps {
  open: boolean;
  onClose: () => void;
  sessions: ScheduledSession[];
  courses: Course[];
  onSelectSession: (session: ScheduledSession) => void;
}

export function PastSessionsReviewDialog({ 
  open, 
  onClose, 
  sessions,
  courses,
  onSelectSession
}: PastSessionsReviewDialogProps) {
  if (sessions.length === 0) {
    return null;
  }

  const getCourseName = (courseId?: string): string => {
    if (!courseId) return 'Unassigned Session';
    return courses.find(c => c.id === courseId)?.name || 'Kurs';
  };

  const getCourseECTS = (courseId?: string): number => {
    if (!courseId) return 0;
    return courses.find(c => c.id === courseId)?.ects || 0;
  };

  // Sort sessions by date (oldest first)
  const sortedSessions = [...sessions].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Vergangene Sessions bewerten
          </DialogTitle>
          <DialogDescription className="sr-only">
            Liste aller vergangenen Sessions, die noch nicht bewertet wurden
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-2">
          <p className="text-sm text-gray-600 mb-4">
            Du hast {sessions.length} vergangene {sessions.length === 1 ? 'Session' : 'Sessions'}, die noch nicht bewertet {sessions.length === 1 ? 'wurde' : 'wurden'}. 
            Bewerte sie jetzt, um deinen Fortschritt zu tracken.
          </p>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {sortedSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session);
                    onClose();
                  }}
                  className="w-full p-3 border rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 mb-1">
                        {getCourseName(session.courseId)}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>
                          {new Date(session.date).toLocaleDateString('de-DE', { 
                            weekday: 'short',
                            day: '2-digit', 
                            month: 'short'
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.startTime}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0">
                      {getCourseECTS(session.courseId)} ECTS
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">
            Später
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
