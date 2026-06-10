"use client";

import { memo } from "react";

export const OverviewLandingScrollCue = memo(function OverviewLandingScrollCue() {
  return (
    <div className="overview-landing-scroll-cue" aria-hidden>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <span>Scroll to explore</span>
    </div>
  );
});

OverviewLandingScrollCue.displayName = "OverviewLandingScrollCue";
