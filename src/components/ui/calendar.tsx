"use client";

import * as React from "react";
import { cn } from "./utils";
import { buttonVariants } from "./button";

type CalendarProps = {
  className?: string;
  hideNavigation?: boolean;
  selected?: Date;
  onSelect?: (date?: Date) => void;
  month?: Date; // current visible month (controlled)
  onMonthChange?: (date: Date) => void;
  showOutsideDays?: boolean;
  disabled?: (date: Date) => boolean; // disable specific dates
  locale?: unknown; // ignored, German labels used by default
  // compatibility props from DayPicker we ignore safely
  mode?: string;
  initialFocus?: boolean;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date: Date, count: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
}

function isSameDay(a?: Date, b?: Date) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getMonthGrid(view: Date, showOutsideDays = true) {
  // Monday-based calendar
  const first = startOfMonth(view);
  const firstWeekday = (first.getDay() + 6) % 7; // 0=Mon, ... 6=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - firstWeekday);

  const cells: { date: Date; outside: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const outside = d.getMonth() !== view.getMonth();
    if (!outside || showOutsideDays) {
      cells.push({ date: d, outside });
    } else {
      cells.push({ date: d, outside: true });
    }
  }
  return cells;
}

export function Calendar({
  className,
  hideNavigation = false,
  selected,
  onSelect,
  month,
  onMonthChange,
  showOutsideDays = true,
  disabled,
}: CalendarProps) {
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [internalMonth, setInternalMonth] = React.useState<Date>(month || selected || new Date());
  React.useEffect(() => {
    if (month) setInternalMonth(month);
  }, [month?.getFullYear(), month?.getMonth()]);

  const view = startOfMonth(internalMonth);
  const cells = React.useMemo(() => getMonthGrid(view, showOutsideDays), [view.getFullYear(), view.getMonth(), showOutsideDays]);

  const [showMonthPicker, setShowMonthPicker] = React.useState(false);
  const [showYearPicker, setShowYearPicker] = React.useState(false);

  const changeMonth = (delta: number) => {
    const next = startOfMonth(addMonths(view, delta));
    setInternalMonth(next);
    onMonthChange?.(next);
    setShowMonthPicker(false);
    setShowYearPicker(false);
  };

  const handleSelect = (d: Date) => {
    onSelect?.(d);
  };

  const pickMonth = (m: number) => {
    const next = new Date(view);
    next.setMonth(m);
    const normalized = startOfMonth(next);
    setInternalMonth(normalized);
    onMonthChange?.(normalized);
    setShowMonthPicker(false);
  };

  const pickYear = (y: number) => {
    const next = new Date(view);
    next.setFullYear(y);
    const normalized = startOfMonth(next);
    setInternalMonth(normalized);
    onMonthChange?.(normalized);
    setShowYearPicker(false);
  };

  return (
    <div className={cn("p-3 w-[308px]", className)}>
      {/* Header */}
      {!hideNavigation && (
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0")}
            onClick={() => changeMonth(-1)}
            aria-label="Vorheriger Monat"
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-sm font-medium hover:underline"
              onClick={() => { setShowMonthPicker((v) => !v); setShowYearPicker(false); }}
              aria-label="Monat wählen"
            >
              {MONTHS[view.getMonth()]}
            </button>
            <button
              type="button"
              className="text-sm font-medium hover:underline"
              onClick={() => { setShowYearPicker((v) => !v); setShowMonthPicker(false); }}
              aria-label="Jahr wählen"
            >
              {view.getFullYear()}
            </button>
          </div>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0")}
            onClick={() => changeMonth(1)}
            aria-label="Nächster Monat"
          >
            ›
          </button>
        </div>
      )}

      {/* Month picker */}
      {showMonthPicker && (
        <div className="grid grid-cols-3 gap-2 p-2 mb-2">
          {MONTHS.map((m, idx) => (
            <button
              key={m}
              type="button"
              className={cn("px-2 py-1 rounded text-sm hover:bg-accent", idx === view.getMonth() && "bg-primary text-primary-foreground")}
              onClick={() => pickMonth(idx)}
            >
              {m.slice(0,3)}
            </button>
          ))}
        </div>
      )}

      {/* Year picker */}
      {showYearPicker && (
        <div className="grid grid-cols-4 gap-2 p-2 mb-2 max-h-48 overflow-auto">
          {Array.from({ length: 21 }, (_, i) => view.getFullYear() - 10 + i).map((y) => (
            <button
              key={y}
              type="button"
              className={cn("px-2 py-1 rounded text-sm hover:bg-accent", y === view.getFullYear() && "bg-primary text-primary-foreground")}
              onClick={() => pickYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Weekday header */}
      <div className="grid grid-cols-8 gap-0 text-center mb-1">
        <div className="text-[0.65rem] text-muted-foreground/40 font-medium h-6 flex items-center justify-center w-6 border-r border-muted-foreground/10">
          KW
        </div>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[0.8rem] text-muted-foreground font-medium h-6 flex items-center justify-center">
            {w}
          </div>
        ))}
      </div>

      {/* Days grid with week numbers */}
      <div className="grid grid-cols-8 gap-0">
        {Array.from({ length: 6 }, (_, weekIndex) => {
          const weekStartDate = cells[weekIndex * 7].date;
          const weekNum = getWeekNumber(weekStartDate);
          return (
            <React.Fragment key={weekIndex}>
              {/* Week number */}
              <div className="h-9 w-6 flex items-center justify-center text-[0.65rem] text-muted-foreground/30 border-r border-muted-foreground/10">
                {weekNum}
              </div>
              {/* Days in this week */}
              {cells.slice(weekIndex * 7, weekIndex * 7 + 7).map(({ date, outside }) => {
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selected);
                const isDisabled = disabled ? disabled(date) : false;
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelect(date)}
                    className={cn(
                      "h-9 w-9 m-[2px] flex items-center justify-center rounded-md text-sm",
                      outside ? "text-muted-foreground/70" : "",
                      isDisabled ? "opacity-50 cursor-not-allowed" : "",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : isToday
                        ? "ring-1 ring-blue-500 text-foreground"
                        : "hover:bg-accent"
                    )}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
