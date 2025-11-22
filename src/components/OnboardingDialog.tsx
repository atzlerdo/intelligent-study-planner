import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { GraduationCap } from 'lucide-react';
import type { StudyProgram } from '../types';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: (program: StudyProgram) => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [totalECTS, setTotalECTS] = useState<'180' | '210'>('180');
  const [completedECTS, setCompletedECTS] = useState('0');
  const [hoursPerECTS, setHoursPerECTS] = useState('27.5');

  const handleComplete = () => {
    const completed = Number(completedECTS);
    const total = Number(totalECTS);
    
    if (completed > total) {
      alert('Die erreichten ECTS können nicht höher sein als die Gesamt-ECTS.');
      return;
    }

    onComplete({
      totalECTS: total,
      completedECTS: completed,
      hoursPerECTS: Number(hoursPerECTS),
    });
  };

  const remainingECTS = Number(totalECTS) - Number(completedECTS);
  const remainingHours = Math.round(remainingECTS * Number(hoursPerECTS));

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-blue-100 rounded-full">
              <GraduationCap className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <DialogTitle className="text-center">Willkommen bei deinem Studienplaner</DialogTitle>
          <DialogDescription className="text-center">
            Lass uns dein Studium einrichten, um deine Zeit optimal zu planen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="totalECTS">Gesamt-ECTS deines Studiums</Label>
            <Select value={totalECTS} onValueChange={(val) => setTotalECTS(val as '180' | '210')}>
              <SelectTrigger id="totalECTS">
                <SelectValue placeholder="ECTS wählen" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="180">180 (Bachelor)</SelectItem>
                <SelectItem value="210">210</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="completedECTS">Bereits erreichte ECTS</Label>
            <Input
              id="completedECTS"
              type="number"
              min="0"
              max={totalECTS}
              value={completedECTS}
              onChange={(e) => setCompletedECTS(e.target.value)}
              placeholder="z.B. 90"
            />
            {Number(completedECTS) > 0 && (
              <p className="text-xs text-gray-500">
                Du hast {Math.round((Number(completedECTS) / Number(totalECTS)) * 100)}% deines Studiums abgeschlossen
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="hoursPerECTS">Stunden pro ECTS-Punkt</Label>
            <Input
              id="hoursPerECTS"
              type="number"
              min="20"
              max="35"
              step="0.5"
              value={hoursPerECTS}
              onChange={(e) => setHoursPerECTS(e.target.value)}
              placeholder="25-30"
            />
            <p className="text-xs text-gray-500">
              Empfohlen: 25-30 Stunden (Standard: 27.5)
            </p>
          </div>

          {remainingECTS > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-900 space-y-1">
                <div className="flex justify-between">
                  <span>Verbleibend:</span>
                  <span className="font-semibold">{remainingECTS}</span>
                </div>
                <div className="flex justify-between">
                  <span>Geschätzte Stunden:</span>
                  <span className="font-semibold">{remainingHours}h</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {/* Make the primary action visually stronger (dark background, larger height, clear affordance) */}
          <Button
            onClick={handleComplete}
            size="lg"
            className="w-full bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md shadow-gray-400/30 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            Los geht's
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
