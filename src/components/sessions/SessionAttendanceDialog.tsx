import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import type { ScheduledSession, Course } from '../../types';
import { Check, X } from 'lucide-react';

interface SessionAttendanceDialogProps {
  open: boolean;
  onClose: () => void;
  session: ScheduledSession | null;
  course: Course | undefined;
  onAttended: () => void;
  onNotAttended: () => void;
}

export function SessionAttendanceDialog({ 
  open, 
  onClose, 
  session, 
  course,
  onAttended,
  onNotAttended
}: SessionAttendanceDialogProps) {
  if (!session) return null;

  const sessionDate = new Date(session.date);
  const formattedDate = sessionDate.toLocaleDateString('de-DE', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Accessible hidden title/description for Radix */}
        <DialogTitle className="sr-only">Session Anwesenheit bestätigen</DialogTitle>
        <DialogDescription className="sr-only">
          Bestätige ob du die ausgewählte Session wahrgenommen hast.
        </DialogDescription>
        <div className="space-y-4" aria-labelledby="dialog-title" aria-describedby="dialog-description">
          <div className="text-center space-y-2">
            <h3 className="text-lg">
              {course ? course.name : '📚 Study Session'}
            </h3>
            <p className="text-sm text-gray-600">{formattedDate}</p>
            <p className="text-sm text-gray-600">
              {session.startTime} - {session.endTime} Uhr ({session.durationMinutes} Min.)
            </p>
          </div>

          <div className="text-center pt-4">
            <p className="mb-4">Hast du diese Session (anteilig) wahrgenommen?</p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={onNotAttended}
                variant="outline"
                size="lg"
                className="flex-1 max-w-[150px] h-20 flex flex-col gap-2"
              >
                <X className="w-8 h-8 text-red-500" />
                <span>Nein</span>
              </Button>
              <Button
                onClick={onAttended}
                variant="default"
                size="lg"
                className="flex-1 max-w-[150px] h-20 flex flex-col gap-2 bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md"
              >
                <Check className="w-8 h-8" />
                <span>Ja</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
