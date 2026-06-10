"use client";

import { memo } from "react";
import {
  PILOT_LANDING_HERO,
  PILOT_VALUE_CHIPS,
} from "@/lib/pilot-landing";
import { ovMuted } from "@/lib/overview-ui";

function ChipIcon({ id }: { id: string }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "insights":
      return (
        <svg {...common} aria-hidden>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
        </svg>
      );
    case "executive":
      return (
        <svg {...common} aria-hidden>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      );
    case "viz":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-6 4 3 5-7" />
        </svg>
      );
    case "followup":
      return (
        <svg {...common} aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common} aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

export const OverviewLandingHero = memo(function OverviewLandingHero() {
  return (
    <section
      id="pilot-landing"
      className="overview-landing-hero mb-4 w-full scroll-mt-24 text-left sm:mb-5"
    >
      <div className="overview-landing-hero__title-block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
          AI Analytics workspace
        </p>
        <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {PILOT_LANDING_HERO.title}
        </h2>
      </div>
      <div className="overview-landing-column overview-landing-hero__aligned">
        <p className={`overview-landing-hero-subtitle mt-2 ${ovMuted}`}>
          {PILOT_LANDING_HERO.subtitle}
        </p>
        <div
          className="overview-landing-chips mt-3 flex flex-wrap gap-2"
          aria-label="Product capabilities"
        >
          {PILOT_VALUE_CHIPS.map((chip) => (
            <span key={chip.id} className="overview-landing-chip">
              <span className="overview-landing-chip__icon" aria-hidden>
                <ChipIcon id={chip.id} />
              </span>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
});

OverviewLandingHero.displayName = "OverviewLandingHero";
