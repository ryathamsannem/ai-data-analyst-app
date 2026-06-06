"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { scheduleEffectUpdate } from "@/lib/effect-scheduler";
import { UsageDashboard } from "@/app/components/usage-dashboard";
import type { PlanTier } from "@/lib/plan-limits";
import {
  getPlanTier,
  PLAN_TIER_CHANGED_EVENT,
  setPlanTier,
} from "@/lib/saas-session";
import { usePlanUsage } from "@/lib/use-plan-usage";

export const PlanUsageMenu = memo(function PlanUsageMenu() {
  const [open, setOpen] = useState(false);
  const [tier, setTierState] = useState<PlanTier>("free");
  const rootRef = useRef<HTMLDivElement>(null);
  const { data, loading, error, refresh } = usePlanUsage({ enabled: open });

  useEffect(() => {
    scheduleEffectUpdate(() => setTierState(getPlanTier()));
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<PlanTier>).detail;
      setTierState(detail ?? getPlanTier());
    };
    window.addEventListener(PLAN_TIER_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PLAN_TIER_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    scheduleEffectUpdate(() => {
      void refresh();
    });
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const switchTier = useCallback(() => {
    const next: PlanTier = tier === "free" ? "paid" : "free";
    setPlanTier(next);
    setTierState(next);
  }, [tier]);

  const label = tier === "paid" ? "Paid" : "Free";

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={
          tier === "paid"
            ? "inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-500/15 dark:text-indigo-200"
            : "inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
        }
      >
        <span
          className={
            tier === "paid"
              ? "h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500"
              : "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          }
        />
        {label}
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Usage and plan"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(100vw-2rem,18rem)] rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] p-3.5 shadow-[0_16px_40px_-20px_rgba(15,23,42,0.45)]"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-subtle)]">
              Usage
            </p>
            <button
              type="button"
              onClick={() => refresh()}
              className="text-[10px] font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
            >
              Refresh
            </button>
          </div>

          <UsageDashboard
            data={data}
            loading={loading}
            error={error}
            compact
          />

          <div className="mt-3 border-t border-[color:var(--border-default)] pt-3">
            <button
              type="button"
              onClick={switchTier}
              className="w-full rounded-lg border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-muted)] transition hover:border-indigo-500/40 hover:text-foreground"
            >
              Switch to {tier === "free" ? "Paid" : "Free"} (preview)
            </button>
            <p className="mt-2 text-[10px] leading-relaxed text-[color:var(--text-subtle)]">
              Mock billing — no payment yet.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
});

PlanUsageMenu.displayName = "PlanUsageMenu";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={open ? "rotate-180 transition" : "transition"}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
