"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useNow } from "@/hooks";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/**
 * Terminal-themed date picker — a themed replacement for the browser's
 * native `<input type="date">` (whose popup calendar is unstyled OS chrome).
 *
 * Controlled: `value`/`onChange` speak the SAME `YYYY-MM-DD` string the
 * native input emitted, so it is a drop-in swap that keeps every consumer's
 * parsing/validation unchanged. Dates before `min` (inclusive `YYYY-MM-DD`)
 * are disabled. Matches the dashboard's always-dark terminal palette.
 *
 * The calendar renders in a PORTAL with viewport-fixed positioning so it is
 * never clipped by an `overflow-hidden` ancestor (e.g. an animated
 * height-collapsing container) and flips above the trigger when there isn't
 * room below.
 */
interface TerminalDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date, `YYYY-MM-DD`. Earlier days are disabled. */
  min?: string;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const POPOVER_WIDTH = 288; // w-72
const POPOVER_HEIGHT = 340; // approximate — used only for flip decision

export function TerminalDatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = "Select a date",
  className = "",
}: TerminalDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );

  const selectedDate = value ? parseISO(value) : null;
  const minDate = min ? startOfDay(parseISO(min)) : null;

  const nowMs = useNow();
  const [viewMonth, setViewMonth] = useState<Date | null>(null);
  const activeMonth =
    viewMonth ?? startOfMonth(selectedDate ?? new Date(nowMs));

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const positionPopover = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp =
      spaceBelow < POPOVER_HEIGHT + 12 && rect.top > POPOVER_HEIGHT;
    // Clamp horizontally so the popover never overflows the viewport edge.
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - POPOVER_WIDTH - 8)
    );
    setCoords({
      top: openUp ? rect.top - POPOVER_HEIGHT - 8 : rect.bottom + 8,
      left,
    });
  };

  // Reposition on open, and keep it anchored while scrolling/resizing.
  useEffect(() => {
    if (!open) return;
    positionPopover();
    const onScrollOrResize = () => positionPopover();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  // Close on outside click / Escape. The popover lives in a portal, so both
  // the trigger AND the popover must count as "inside".
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openPicker = () => {
    setViewMonth(startOfMonth(selectedDate ?? new Date()));
    setOpen(true);
  };

  const isDisabled = (day: Date) =>
    minDate !== null && isBefore(startOfDay(day), minDate);

  const selectDay = (day: Date) => {
    if (isDisabled(day)) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  const gridStart = startOfWeek(startOfMonth(activeMonth));
  const gridEnd = endOfWeek(endOfMonth(activeMonth));
  const days: Date[] = [];
  for (let d = gridStart; !isBefore(gridEnd, d); d = addDays(d, 1)) {
    days.push(d);
  }

  const today = new Date(nowMs);

  return (
    <div className={className}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-surface-raised px-3 py-2 text-left text-sm text-ink transition-colors hover:border-line-strong focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line"
      >
        <span className={selectedDate ? "text-ink" : "text-ink-subtle"}>
          {selectedDate ? format(selectedDate, "MMM d, yyyy") : placeholder}
        </span>
        <Calendar className="h-4 w-4 shrink-0 text-ink-subtle" />
      </button>

      {open &&
        coords !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose a date"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
            }}
            className="z-[100] rounded-lg border border-line bg-surface p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {format(activeMonth, "MMMM yyyy")}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setViewMonth((m) => addMonths(m ?? activeMonth, -1))
                  }
                  className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setViewMonth((m) => addMonths(m ?? activeMonth, 1))
                  }
                  className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((weekday, i) => (
                <div
                  key={`${weekday}-${i}`}
                  className="py-1 text-center text-xs font-medium text-ink-subtle"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day) => {
                const disabled = isDisabled(day);
                const selected =
                  selectedDate !== null && isSameDay(day, selectedDate);
                const inMonth = isSameMonth(day, activeMonth);
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => selectDay(day)}
                    className={`h-8 rounded-md text-sm transition-colors ${
                      selected
                        ? "bg-accent-soft font-semibold text-accent ring-1 ring-accent-line"
                        : disabled
                          ? "cursor-not-allowed text-ink-faint"
                          : inMonth
                            ? "text-ink hover:bg-surface-hover"
                            : "text-ink-faint hover:bg-surface-hover/60"
                    } ${isToday && !selected ? "ring-1 ring-line-strong" : ""}`}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => selectDay(startOfDay(today))}
                disabled={isDisabled(today)}
                className="text-xs font-medium text-accent transition-colors hover:text-accent disabled:cursor-not-allowed disabled:text-ink-faint"
              >
                Today
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
