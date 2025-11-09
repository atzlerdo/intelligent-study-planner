import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { CheckCircle2, XCircle, Info, Plus, Check } from 'lucide-react';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import type { ScheduledSession, Course } from './../types';

interface SessionFeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  session: ScheduledSession | null;
  course: Course | null;
  onSubmit: (feedback: { 
    sessionId: string; 
    completed: boolean; 
    completedHours: number;
    selfAssessmentProgress: number;
    completedMilestones?: string[];
    newMilestones?: string[];
  }) => void;
  skipAttendanceQuestion?: boolean; // Skip the "Did you attend?" question
}

export function SessionFeedbackDialog({ 
  open, 
  onClose, 
  session,
  course,
  onSubmit,
  skipAttendanceQuestion = false
}: SessionFeedbackDialogProps) {
  // Calculate initial values
  const getInitialHours = () => session?.durationMinutes ? session.durationMinutes / 60 : 2;
  
  const calculateInitialProgress = (): number => {
    if (!course || !session) return 50;
    const hoursSpent = course.completedHours + getInitialHours();
    const totalPlanned = course.estimatedHours;
    return Math.min(Math.round((hoursSpent / totalPlanned) * 100), 100);
  };

  const [completed, setCompleted] = useState(true);
  const [completedHours, setCompletedHours] = useState(getInitialHours());
  const [showMilestones, setShowMilestones] = useState(false);
  const [completedMilestoneIds, setCompletedMilestoneIds] = useState<Set<string>>(new Set());
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestones, setNewMilestones] = useState<string[]>([]);
  const [selfAssessmentProgress, setSelfAssessmentProgress] = useState(calculateInitialProgress());

  // Reset form when session changes
  useEffect(() => {
    if (session && course) {
      const initialHours = session.durationMinutes / 60;
      setCompletedHours(initialHours);
      setCompleted(true);
      setShowMilestones(false);
      setCompletedMilestoneIds(new Set());
      setNewMilestones([]);
      setNewMilestoneTitle('');
      
      // Recalculate progress
      const hoursSpent = course.completedHours + initialHours;
      const totalPlanned = course.estimatedHours;
      const progress = Math.min(Math.round((hoursSpent / totalPlanned) * 100), 100);
      setSelfAssessmentProgress(progress);
    }
  }, [session, course]);

  const handleSubmit = () => {
    if (!session) return;
    
    onSubmit({
      sessionId: session.id,
      completed,
      completedHours: completed ? completedHours : 0,
      selfAssessmentProgress,
      completedMilestones: Array.from(completedMilestoneIds),
      newMilestones: newMilestones.length > 0 ? newMilestones : undefined,
    });
    
    // Reset form
    setCompleted(true);
    setCompletedHours(session?.durationMinutes ? session.durationMinutes / 60 : 2);
    setShowMilestones(false);
    setCompletedMilestoneIds(new Set());
    setNewMilestones([]);
    setNewMilestoneTitle('');
  };

  const toggleMilestone = (milestoneId: string) => {
    setCompletedMilestoneIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(milestoneId)) {
        newSet.delete(milestoneId);
      } else {
        newSet.add(milestoneId);
      }
      return newSet;
    });
  };

  const addNewMilestone = () => {
    if (newMilestoneTitle.trim()) {
      setNewMilestones(prev => [...prev, newMilestoneTitle.trim()]);
      setNewMilestoneTitle('');
    }
  };

  const removeNewMilestone = (index: number) => {
    setNewMilestones(prev => prev.filter((_, i) => i !== index));
  };

  if (!session || !course) {
    return null;
  }

  const sessionDurationHours = session.durationMinutes / 60;
  const hoursSpent = course.completedHours;
  const totalPlanned = course.estimatedHours;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Session bewerten</DialogTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Info className="w-4 h-4 text-gray-500" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <p className="text-sm text-gray-600">
                  Bewerte deine absolvierte Lernsession und markiere erreichte Meilensteine. 
                  Dies hilft bei der Berechnung deiner voraussichtlichen Prüfungs- oder Abgabetauglichkeit.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <DialogDescription className="sr-only">
            Bewerte deine absolvierte Lernsession und markiere erreichte Meilensteine.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-gray-900">{course.name}</div>
                <div className="text-sm text-gray-500">
                  {new Date(session.date).toLocaleDateString('de-DE', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {session.startTime} - {session.endTime} ({sessionDurationHours.toFixed(1)}h)
                </div>
              </div>
            </div>
            
            {!skipAttendanceQuestion && (
              <div className="space-y-2">
                <label className="text-sm text-gray-700">Hast du die Session wahrgenommen?</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={completed ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setCompleted(true)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Ja
                  </Button>
                  <Button
                    type="button"
                    variant={!completed ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setCompleted(false)}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Nein
                  </Button>
                </div>
              </div>
            )}

            {completed && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-gray-700">Wie viele Stunden wurden aufgebracht?</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max={sessionDurationHours * 2}
                      step="0.5"
                      value={completedHours}
                      onChange={(e) => {
                        const newHours = parseFloat(e.target.value) || 0;
                        setCompletedHours(newHours);
                        // Update progress slider
                        const newProgress = Math.min(
                          Math.round(((hoursSpent + newHours) / totalPlanned) * 100),
                          100
                        );
                        setSelfAssessmentProgress(newProgress);
                      }}
                      className="flex-1 min-w-0"
                    />
                    <span className="text-sm text-gray-600 shrink-0">Stunden</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-700">Wie weit in diesem Kurs fühlst du dich?</label>
                    <span className="text-sm font-semibold text-gray-900">
                      {selfAssessmentProgress}%
                    </span>
                  </div>
                  <Slider
                    value={[selfAssessmentProgress]}
                    onValueChange={(value) => setSelfAssessmentProgress(value[0])}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Noch nichts</span>
                    <span>Prüfungsreif</span>
                  </div>
                </div>

                {!showMilestones ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowMilestones(true)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Meilenstein erreicht
                  </Button>
                ) : (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700">Erreichte Meilensteine:</label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMilestones(false)}
                      >
                        Schließen
                      </Button>
                    </div>
                    
                    {/* Existing milestones */}
                    {course.milestones && course.milestones.length > 0 && (
                      <div className="space-y-2">
                        {course.milestones.map(milestone => (
                          <div key={milestone.id} className="flex items-center space-x-2 bg-white p-2 rounded">
                            <Checkbox
                              id={`milestone-${milestone.id}`}
                              checked={completedMilestoneIds.has(milestone.id)}
                              onCheckedChange={() => toggleMilestone(milestone.id)}
                            />
                            <Label
                              htmlFor={`milestone-${milestone.id}`}
                              className="text-sm text-gray-700 cursor-pointer flex-1"
                            >
                              {milestone.title}
                              {milestone.deadline && (
                                <span className="text-xs text-gray-500 ml-2">
                                  (bis {new Date(milestone.deadline).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })})
                                </span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New milestones */}
                    {newMilestones.length > 0 && (
                      <div className="space-y-2">
                        {newMilestones.map((milestone, index) => (
                          <div key={index} className="flex items-center justify-between bg-blue-50 p-2 rounded">
                            <span className="text-sm text-gray-700">{milestone}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeNewMilestone(index)}
                            >
                              <XCircle className="w-4 h-4 text-gray-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new milestone */}
                    <div className="space-y-2">
                      <Label className="text-sm text-gray-700">Neuen Meilenstein hinzufügen:</Label>
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="z.B. Kapitel 3 abgeschlossen"
                          value={newMilestoneTitle}
                          onChange={(e) => setNewMilestoneTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addNewMilestone();
                            }
                          }}
                          className="flex-1 min-w-0"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={addNewMilestone}
                          disabled={!newMilestoneTitle.trim()}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
