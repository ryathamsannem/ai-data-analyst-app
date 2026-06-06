"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ovFilterDateField,
  ovFilterDateFieldValue,
  ovFilterDateFieldValuePlaceholder,
  ovFilterDatePickerDay,
  ovFilterDatePickerDayMuted,
  ovFilterDatePickerDaySelected,
  ovFilterDatePickerGrid,
  ovFilterDatePickerHeader,
  ovFilterDatePickerMonth,
  ovFilterDatePickerNavBtn,
  ovFilterDatePickerPopup,
  ovFilterDatePickerWeekday,
  ovFilterDatePickerWeekdays,
} from "@/lib/overview-ui";
import { scheduleEffectUpdate } from "@/lib/effect-scheduler";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(viewMonth: Date): { date: Date; inMonth: boolean }[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, daysInPrev - i),
      inMonth: false,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  let trailing = 1;
  while (cells.length < 42) {
    cells.push({
      date: new Date(year, month + 1, trailing++),
      inMonth: false,
    });
  }
  return cells;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const FILTER_DATE_PLACEHOLDER = "yyyy-mm-dd";

function FilterDateFieldInner({
  value,
  onChange,
  ariaLabel,
  inputClassName,
}: {
  value: string;
  onChange: (iso: string) => void;
  ariaLabel: string;
  inputClassName: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [viewMonth, setViewMonth] = useState(() => {
    const parsed = parseIsoDate(value);
    const base = parsed ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const displayText = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (ISO_DATE.test(trimmed)) return trimmed;
    const parsed = parseIsoDate(trimmed);
    return parsed ? toIsoDate(parsed) : trimmed;
  }, [value]);

  const isEmpty = displayText.length === 0;

  const popupId = useMemo(
    () => `filter-date-popup-${ariaLabel.replace(/\s+/g, "-").toLowerCase()}`,
    [ariaLabel]
  );

  const monthCells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const monthTitle = useMemo(
    () =>
      viewMonth.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [viewMonth]
  );

  const updatePopupPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const minWidth = Math.max(rect.width, 17.5 * 16);
    let left = rect.left;
    const maxLeft = window.innerWidth - minWidth - 12;
    if (left > maxLeft) left = Math.max(12, maxLeft);

    setPopupStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left,
      minWidth,
      zIndex: 10000,
    });
  }, []);

  useEffect(() => {
    const parsed = parseIsoDate(value);
    if (parsed) {
      const next = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
      scheduleEffectUpdate(() => setViewMonth(next));
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    updatePopupPosition();
    const onReflow = () => updatePopupPosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, updatePopupPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const popup = document.getElementById(popupId);
      if (popup?.contains(target)) return;
      setOpen(false);
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
  }, [open, popupId]);

  const shiftMonth = useCallback((delta: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const pickDay = useCallback(
    (d: Date) => {
      onChange(toIsoDate(d));
      setOpen(false);
    },
    [onChange]
  );

  const popup =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            id={popupId}
            className={ovFilterDatePickerPopup}
            role="dialog"
            aria-modal="false"
            aria-label={ariaLabel}
            style={popupStyle}
          >
            <div className={ovFilterDatePickerHeader}>
              <button
                type="button"
                className={ovFilterDatePickerNavBtn}
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                ‹
              </button>
              <p className={ovFilterDatePickerMonth}>{monthTitle}</p>
              <button
                type="button"
                className={ovFilterDatePickerNavBtn}
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className={ovFilterDatePickerWeekdays}>
              {WEEKDAYS.map((d) => (
                <span key={d} className={ovFilterDatePickerWeekday}>
                  {d}
                </span>
              ))}
            </div>
            <div className={ovFilterDatePickerGrid}>
              {monthCells.map(({ date, inMonth }) => {
                const isSelected =
                  selectedDate != null && sameCalendarDay(date, selectedDate);
                const isToday = sameCalendarDay(date, today);
                let dayCls = ovFilterDatePickerDay;
                if (!inMonth) dayCls = ovFilterDatePickerDayMuted;
                else if (isSelected) dayCls = ovFilterDatePickerDaySelected;

                return (
                  <button
                    key={toIsoDate(date)}
                    type="button"
                    className={dayCls}
                    data-today={isToday && inMonth ? "true" : undefined}
                    onClick={() => pickDay(date)}
                    aria-label={date.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    aria-pressed={isSelected}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`${ovFilterDateField} relative min-h-0 min-w-0 flex-1`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${inputClassName} filter-date-field__trigger flex w-full min-w-0 items-center justify-between gap-1 text-left`}
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) queueMicrotask(updatePopupPosition);
            return next;
          });
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? popupId : undefined}
      >
        <span
          className={
            isEmpty ? ovFilterDateFieldValuePlaceholder : ovFilterDateFieldValue
          }
        >
          {isEmpty ? FILTER_DATE_PLACEHOLDER : displayText}
        </span>
        <span className="filter-date-field__icon shrink-0" aria-hidden />
      </button>
      {popup}
    </div>
  );
}

export const FilterDateField = memo(FilterDateFieldInner);
FilterDateField.displayName = "FilterDateField";
