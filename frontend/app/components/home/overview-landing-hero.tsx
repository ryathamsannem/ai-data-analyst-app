"use client";

import { memo } from "react";
import {
  PILOT_LANDING_HERO,
  PILOT_VALUE_CHIPS,
} from "@/lib/pilot-landing";
import { ovCapabilityChip, ovMuted } from "@/lib/overview-ui";

export const OverviewLandingHero = memo(function OverviewLandingHero() {
  return (
    <section
      id="pilot-landing"
      className="overview-landing-hero mx-auto mb-8 max-w-5xl scroll-mt-24 sm:mb-10"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
        AI Analytics workspace
      </p>
      <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {PILOT_LANDING_HERO.title}
      </h2>
      <p className={`overview-landing-hero-subtitle mt-3 ${ovMuted}`}>
        {PILOT_LANDING_HERO.subtitle}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Product capabilities">
        {PILOT_VALUE_CHIPS.map((chip) => (
          <span key={chip} className={ovCapabilityChip}>
            {chip}
          </span>
        ))}
      </div>
      <p className={`mt-4 text-xs ${ovMuted}`}>
        No dataset uploaded yet — choose a file below to begin analysis.
      </p>
    </section>
  );
});

OverviewLandingHero.displayName = "OverviewLandingHero";
