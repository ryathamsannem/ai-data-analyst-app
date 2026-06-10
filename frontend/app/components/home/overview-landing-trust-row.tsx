"use client";

import { memo } from "react";
import { PILOT_TRUST_FEATURES } from "@/lib/pilot-landing";

function TrustIcon({ id }: { id: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "secure":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "insights":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 3a6 6 0 0 0 9 9" />
          <path d="M12 3a6 6 0 0 1-9 9" />
          <path d="M12 3v9" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "viz":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-6 4 3 5-7" />
        </svg>
      );
    case "export":
      return (
        <svg {...common} aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9 15 12 12 15 15" />
        </svg>
      );
    default:
      return null;
  }
}

export const OverviewLandingTrustRow = memo(function OverviewLandingTrustRow() {
  return (
    <section
      className="overview-landing-trust overview-landing-column order-2 lg:col-span-2"
      aria-label="Product trust highlights"
    >
      <ul className="overview-landing-trust__grid">
        {PILOT_TRUST_FEATURES.map((item) => (
          <li key={item.id}>
            <article className="overview-landing-trust__card">
              <span className="overview-landing-trust__icon" aria-hidden>
                <TrustIcon id={item.id} />
              </span>
              <div className="min-w-0">
                <p className="overview-landing-trust__title">{item.title}</p>
                <p className="overview-landing-trust__desc">{item.description}</p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
});

OverviewLandingTrustRow.displayName = "OverviewLandingTrustRow";
