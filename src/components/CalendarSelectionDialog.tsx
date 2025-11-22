/**
 * Calendar Selection Dialog
 * 
 * Shown when multiple calendars with the same name exist or when
 * the user needs to choose how to handle existing calendars.
 * 
 * Options:
 * 1. Use existing calendar (merge data)
 * 2. Create new calendar
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Calendar, Plus } from 'lucide-react';
import { useState } from 'react';

interface CalendarOption {
  id: string;
  summary: string;
  description?: string;
}

interface CalendarSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCalendars: CalendarOption[];
  onSelect: (calendarId: string | 'create-new') => void;
}

export function CalendarSelectionDialog({
  open,
  onOpenChange,
  existingCalendars,
  onSelect,
}: CalendarSelectionDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string>(
    existingCalendars.length > 0 ? existingCalendars[0].id : 'create-new'
  );

  const handleConfirm = () => {
    onSelect(selectedOption);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose Google Calendar</DialogTitle>
          <DialogDescription>
            {existingCalendars.length > 0 ? (
              <>
                We found {existingCalendars.length === 1 ? 'a calendar' : `${existingCalendars.length} calendars`} named "Intelligent Study Planner" in your Google account.
                Would you like to use an existing calendar or create a new one?
              </>
            ) : (
              'No existing calendar found. A new calendar will be created.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[50vh] pr-2">
          <RadioGroup value={selectedOption} onValueChange={setSelectedOption} className="space-y-3">
            {existingCalendars.map((calendar) => (
              <div key={calendar.id} className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value={calendar.id} id={calendar.id} className="mt-1 flex-shrink-0" />
                <div className="flex-1 space-y-1 min-w-0">
                  <Label htmlFor={calendar.id} className="flex items-center gap-2 cursor-pointer font-medium">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    Use existing calendar
                  </Label>
                  <p className="text-sm text-muted-foreground break-words">
                    Merge with calendar: <span className="font-mono text-xs break-all">{calendar.id}</span>
                  </p>
                  {calendar.description && (
                    <p className="text-sm text-muted-foreground italic break-words">
                      {calendar.description}
                    </p>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="create-new" id="create-new" className="mt-1 flex-shrink-0" />
              <div className="flex-1 space-y-1 min-w-0">
                <Label htmlFor="create-new" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Plus className="h-4 w-4 flex-shrink-0" />
                  Create new calendar
                </Label>
                <p className="text-sm text-muted-foreground">
                  Start fresh with a new "Intelligent Study Planner" calendar
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
