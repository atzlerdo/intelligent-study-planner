import { useState, useEffect } from 'react';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export interface RecurrencePattern {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string[]; // For WEEKLY: MO, TU, WE, TH, FR, SA, SU
  byMonthDay?: number; // For MONTHLY: 1-31
  endType: 'never' | 'until' | 'count';
  until?: string; // ISO date string
  count?: number;
}

interface RecurrencePatternPickerProps {
  value: RecurrencePattern | null;
  onChange: (pattern: RecurrencePattern | null) => void;
  startDate: string; // ISO date string (YYYY-MM-DD)
}

const WEEKDAYS = [
  { value: 'MO', label: 'Mo' },
  { value: 'TU', label: 'Di' },
  { value: 'WE', label: 'Mi' },
  { value: 'TH', label: 'Do' },
  { value: 'FR', label: 'Fr' },
  { value: 'SA', label: 'Sa' },
  { value: 'SU', label: 'So' },
];

export function RecurrencePatternPicker({ value, onChange, startDate }: RecurrencePatternPickerProps) {
  const [pattern, setPattern] = useState<RecurrencePattern>(
    value || {
      frequency: 'WEEKLY',
      interval: 1,
      byDay: [],
      endType: 'never',
    }
  );

  useEffect(() => {
    if (value) {
      setPattern(value);
    }
  }, [value]);

  const handleUpdate = (updates: Partial<RecurrencePattern>) => {
    const newPattern = { ...pattern, ...updates };
    setPattern(newPattern);
    onChange(newPattern);
  };

  const toggleWeekday = (day: string) => {
    const currentDays = pattern.byDay || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    handleUpdate({ byDay: newDays });
  };

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="space-y-2">
        <Label>Wiederholung</Label>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-600">Alle</span>
          <Input
            type="number"
            min={1}
            max={99}
            value={pattern.interval}
            onChange={(e) => handleUpdate({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-16"
          />
          <Select
            value={pattern.frequency}
            onValueChange={(value) => handleUpdate({ frequency: value as RecurrencePattern['frequency'] })}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY">Tag(e)</SelectItem>
              <SelectItem value="WEEKLY">Woche(n)</SelectItem>
              <SelectItem value="MONTHLY">Monat(e)</SelectItem>
              <SelectItem value="YEARLY">Jahr(e)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {pattern.frequency === 'WEEKLY' && (
        <div className="space-y-2">
          <Label>An diesen Tagen</Label>
          <div className="flex gap-1.5">
            {WEEKDAYS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleWeekday(value)}
                className={`
                  flex-1 h-9 rounded-md text-sm font-medium transition-colors
                  ${
                    pattern.byDay?.includes(value)
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          {pattern.byDay && pattern.byDay.length === 0 && (
            <p className="text-xs text-red-600">Bitte wähle mindestens einen Tag aus</p>
          )}
        </div>
      )}

      {pattern.frequency === 'MONTHLY' && (
        <div className="space-y-2">
          <Label>Am Tag des Monats</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={pattern.byMonthDay || new Date(startDate).getDate()}
            onChange={(e) => handleUpdate({ byMonthDay: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
            className="w-24"
          />
        </div>
      )}

      <div className="space-y-3">
        <Label>Endet</Label>
        <RadioGroup value={pattern.endType} onValueChange={(value) => handleUpdate({ endType: value as RecurrencePattern['endType'] })}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="never" id="never" />
            <Label htmlFor="never" className="font-normal cursor-pointer">Nie</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="until" id="until" />
            <Label htmlFor="until" className="font-normal cursor-pointer">Am</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pattern.endType !== 'until'}
                  className="ml-2"
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {pattern.until
                    ? format(new Date(pattern.until), 'dd.MM.yyyy', { locale: de })
                    : 'Datum wählen'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white" align="start">
                <Calendar
                  mode="single"
                  selected={pattern.until ? new Date(pattern.until) : undefined}
                  onSelect={(selectedDate) => {
                    if (selectedDate) {
                      handleUpdate({ until: format(selectedDate, 'yyyy-MM-dd') });
                    }
                  }}
                  disabled={(date) => date < new Date(startDate)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="count" id="count" />
            <Label htmlFor="count" className="font-normal cursor-pointer">Nach</Label>
            <Input
              type="number"
              min={1}
              max={999}
              disabled={pattern.endType !== 'count'}
              value={pattern.count || 10}
              onChange={(e) => handleUpdate({ count: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-20 ml-2"
            />
            <span className="text-sm text-gray-600">Wiederholung(en)</span>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

export function buildRRuleString(pattern: RecurrencePattern, _dtstart: string): string {
  const parts: string[] = [`FREQ=${pattern.frequency}`];
  
  if (pattern.interval > 1) {
    parts.push(`INTERVAL=${pattern.interval}`);
  }

  if (pattern.frequency === 'WEEKLY' && pattern.byDay && pattern.byDay.length > 0) {
    parts.push(`BYDAY=${pattern.byDay.join(',')}`);
  }

  if (pattern.frequency === 'MONTHLY' && pattern.byMonthDay) {
    parts.push(`BYMONTHDAY=${pattern.byMonthDay}`);
  }

  if (pattern.endType === 'until' && pattern.until) {
    // Convert YYYY-MM-DD to YYYYMMDD format for RRULE
    const untilDate = pattern.until.replace(/-/g, '');
    parts.push(`UNTIL=${untilDate}T235959Z`);
  }

  if (pattern.endType === 'count' && pattern.count) {
    parts.push(`COUNT=${pattern.count}`);
  }

  return parts.join(';');
}

export function parseRRuleString(rrule: string, _dtstart: string): RecurrencePattern | null {
  try {
    const parts = rrule.split(';');
    const pattern: Partial<RecurrencePattern> = {
      frequency: 'WEEKLY',
      interval: 1,
      endType: 'never',
    };

    parts.forEach(part => {
      const [key, value] = part.split('=');
      
      switch (key) {
        case 'FREQ':
          pattern.frequency = value as RecurrencePattern['frequency'];
          break;
        case 'INTERVAL':
          pattern.interval = parseInt(value);
          break;
        case 'BYDAY':
          pattern.byDay = value.split(',');
          break;
        case 'BYMONTHDAY':
          pattern.byMonthDay = parseInt(value);
          break;
        case 'UNTIL':
          pattern.endType = 'until';
          // Convert YYYYMMDDTHHMMSSZ to YYYY-MM-DD
          const untilStr = value.replace(/T.*$/, '');
          pattern.until = `${untilStr.slice(0, 4)}-${untilStr.slice(4, 6)}-${untilStr.slice(6, 8)}`;
          break;
        case 'COUNT':
          pattern.endType = 'count';
          pattern.count = parseInt(value);
          break;
      }
    });

    return pattern as RecurrencePattern;
  } catch (error) {
    console.error('Failed to parse RRULE:', error);
    return null;
  }
}
