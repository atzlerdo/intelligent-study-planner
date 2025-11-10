import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { Course, Milestone } from '../../types';
import { Plus, X } from 'lucide-react';

// Helper functions for date formatting
const formatDateDE = (isoDate: string): string => {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
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

interface CourseDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (course: Omit<Course, 'id' | 'progress' | 'completedHours' | 'createdAt'>) => void;
  course?: Course;
}

export function CourseDialog({ open, onClose, onSave, course }: CourseDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'written-exam' | 'project'>('written-exam');
  const [ects, setEcts] = useState('5');
  const [hoursPerEcts, setHoursPerEcts] = useState('27.5');
  const [examDate, setExamDate] = useState(''); // ISO format
  const [examDateDisplay, setExamDateDisplay] = useState(''); // German format
  const [semester, setSemester] = useState('');
  const [milestones, setMilestones] = useState<Omit<Milestone, 'id'>[]>([]);

  useEffect(() => {
    if (course) {
      setName(course.name);
      setType(course.type);
      setEcts(course.ects.toString());
      setHoursPerEcts((course.estimatedHours / course.ects).toString());
      const examDateValue = course.examDate || '';
      setExamDate(examDateValue);
      setExamDateDisplay(formatDateDE(examDateValue));
      setSemester(course.semester?.toString() || '');
      setMilestones(course.milestones.map(m => ({ title: m.title, deadline: m.deadline, completed: m.completed })));
    } else {
      setName('');
      setType('written-exam');
      setEcts('5');
      setHoursPerEcts('27.5');
      setExamDate('');
      setExamDateDisplay('');
      setSemester('');
      setMilestones([]);
    }
  }, [course, open]);

  const handleAddMilestone = () => {
    setMilestones([...milestones, { title: '', deadline: '', completed: false }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, field: keyof Milestone, value: string) => {
    const updated = [...milestones];
    if (field === 'deadline') {
      // Value is in German format, convert to ISO for storage
      const isoDate = parseDateDE(value);
      updated[index] = { ...updated[index], [field]: isoDate || value };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setMilestones(updated);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    const ectsPoints = Number(ects) || 5;
    const estimatedHours = ectsPoints * (Number(hoursPerEcts) || 27.5);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);

    onSave({
      name: name.trim(),
      type,
      ects: ectsPoints,
      estimatedHours: Math.round(estimatedHours),
      scheduledHours: 0,
      status: 'planned',
      estimatedEndDate: endDate.toISOString().split('T')[0],
      examDate: examDate || undefined,
      semester: semester ? Number(semester) : undefined,
      milestones: milestones
        .filter(m => m.title.trim())
        .map((m, i) => ({
          id: `milestone-${Date.now()}-${i}`,
          title: m.title.trim(),
          deadline: m.deadline || new Date().toISOString().split('T')[0],
          completed: m.completed,
        })),
    });

    onClose();
  };

  const estimatedHours = Math.round(Number(ects) * Number(hoursPerEcts));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{course ? 'Kurs bearbeiten' : 'Neuer Kurs'}</DialogTitle>
          <DialogDescription>
            Füge einen neuen Kurs hinzu oder bearbeite einen bestehenden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Kursname *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Advanced Mathematics"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Typ *</Label>
            <Select
              value={type}
              onValueChange={(val: 'written-exam' | 'project') => setType(val)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="written-exam">Schriftliche Prüfung</SelectItem>
                <SelectItem value="project">Projekt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ects">ECTS-Punkte *</Label>
              <Input
                id="ects"
                type="number"
                min="1"
                max="30"
                value={ects}
                onChange={(e) => setEcts(e.target.value)}
                placeholder="5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hoursPerEcts">Stunden/ECTS</Label>
              <Input
                id="hoursPerEcts"
                type="number"
                min="20"
                max="35"
                step="0.5"
                value={hoursPerEcts}
                onChange={(e) => setHoursPerEcts(e.target.value)}
                placeholder="27.5"
              />
            </div>
          </div>

          {estimatedHours > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-900">
                Geschätzte Gesamtstunden: <span className="font-semibold">{estimatedHours}h</span>
                {estimatedHours === 137.5 && (
                  <span className="text-xs ml-2 text-blue-600">(empfohlen)</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="semester">Semester (optional)</Label>
              <Input
                id="semester"
                type="number"
                min="1"
                max="6"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="z.B. 3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="examDate">
                {type === 'written-exam' ? 'Prüfungsdatum' : 'Abgabedatum'}
              </Label>
              <Input
                id="examDate"
                type="text"
                value={examDateDisplay}
                onChange={(e) => {
                  const value = e.target.value;
                  setExamDateDisplay(value);
                  const isoDate = parseDateDE(value);
                  if (isoDate) {
                    setExamDate(isoDate);
                  }
                }}
                placeholder="TT.MM.JJJJ"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Meilensteine (optional)</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddMilestone}>
                <Plus className="w-4 h-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
            
            {milestones.length > 0 && (
              <div className="space-y-3">
                {milestones.map((milestone, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 border rounded-lg">
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        placeholder="Meilenstein-Titel"
                        value={milestone.title}
                        onChange={(e) => handleMilestoneChange(index, 'title', e.target.value)}
                      />
                      <Input
                        type="text"
                        value={formatDateDE(milestone.deadline)}
                        onChange={(e) => handleMilestoneChange(index, 'deadline', e.target.value)}
                        placeholder="TT.MM.JJJJ"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleRemoveMilestone(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()} size="lg" className="bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md disabled:bg-gray-400">
            {course ? 'Speichern' : 'Erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
