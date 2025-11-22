import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { StudyBlock } from '../types';
import { calculateDuration } from '../lib/scheduler';

interface StudyBlockDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (block: Omit<StudyBlock, 'id'>) => void;
  block?: StudyBlock;
}

const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function StudyBlockDialog({ open, onClose, onSave, block }: StudyBlockDialogProps) {
  const [dayOfWeek, setDayOfWeek] = useState('1'); // Monday default
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');

  useEffect(() => {
    if (block) {
      setDayOfWeek(block.dayOfWeek.toString());
      setStartTime(block.startTime);
      setEndTime(block.endTime);
    } else {
      setDayOfWeek('1');
      setStartTime('18:00');
      setEndTime('21:00');
    }
  }, [block, open]);

  const handleSubmit = () => {
    const duration = calculateDuration(startTime, endTime);
    
    if (duration <= 0) {
      alert('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }

    onSave({
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      durationMinutes: duration,
      isActive: true,
    });

    onClose();
  };

  const duration = calculateDuration(startTime, endTime);
  const durationHours = Math.round(duration / 60 * 10) / 10;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{block ? 'Lernblock bearbeiten' : 'Neuer Lernblock'}</DialogTitle>
          <DialogDescription>
            Definiere ein wöchentliches Zeitfenster für dein Studium.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="day">Wochentag *</Label>
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger id="day">
                <SelectValue placeholder="Wochentag wählen" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {DAYS_DE.map((day, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Startzeit *</Label>
              <Input
                id="start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end">Endzeit *</Label>
              <Input
                id="end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {duration > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-900">
                Dauer: <span className="font-semibold">{durationHours} Stunden</span>
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={duration <= 0} size="lg" className="bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md disabled:bg-gray-400">
            {block ? 'Speichern' : 'Erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
