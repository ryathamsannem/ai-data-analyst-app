"use client";

import { memo } from "react";
import {
  PILOT_PAYMENT_NOTE,
  PILOT_PRIVACY_COPY,
  PILOT_SECURITY_COPY,
  buildPilotPricingTiers,
  type PilotNavTarget,
} from "@/lib/pilot-landing";
import { pilotInfoModalTitle } from "@/lib/pilot-nav-state";
import { BRANDING } from "@/lib/branding-config";
import { ovCard, ovMuted } from "@/lib/overview-ui";

export const PilotInfoModal = memo(function PilotInfoModal({
  section,
  onClose,
}: {
  section: Exclude<PilotNavTarget, "home"> | null;
  onClose: () => void;
}) {
  if (!section) return null;

  const tiers = buildPilotPricingTiers();
  const title = pilotInfoModalTitle(section);

  return (
    <div
      className="pilot-info-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="pilot-info-modal-panel flex max-h-[min(90vh,52rem)] w-full max-w-[min(100%,52rem)] flex-col overflow-hidden rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--card)] shadow-[var(--shadow-card)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pilot-info-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--border-default)] px-5 py-4 sm:px-8 sm:py-5">
          <h2
            id="pilot-info-modal-title"
            className="text-lg font-semibold text-foreground sm:text-xl"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-subtle)] text-lg leading-none text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-elevated)] hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {section === "pricing" ? (
            <div className="space-y-5">
              <p className={`text-sm leading-relaxed ${ovMuted}`}>
                Informational preview only — use the header plan toggle to explore Free vs
                Paid limits.
              </p>
              <p className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-3 text-sm text-[color:var(--foreground)]">
                {PILOT_PAYMENT_NOTE}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {tiers.map((tier) => (
                  <article key={tier.name} className={`${ovCard} p-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-foreground">{tier.name}</h3>
                      {tier.badge ? (
                        <span className="rounded-full border border-[color:var(--border-default)] px-2.5 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)]">
                          {tier.badge}
                        </span>
                      ) : null}
                    </div>
                    <ul className={`mt-4 space-y-2 text-sm leading-relaxed ${ovMuted}`}>
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <span aria-hidden className="text-[color:var(--accent)]">
                            •
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {section === "privacy" ? (
            <ul className={`space-y-3 text-sm leading-relaxed ${ovMuted}`}>
              {PILOT_PRIVACY_COPY.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-[color:var(--accent)]">
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {section === "security" ? (
            <ul className={`space-y-3 text-sm leading-relaxed ${ovMuted}`}>
              {PILOT_SECURITY_COPY.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-[color:var(--accent)]">
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {section === "contact" ? (
            <div className={`space-y-3 text-sm leading-relaxed ${ovMuted}`}>
              <p>
                Questions about the pilot, limits, or deployment? Reach us at{" "}
                <a
                  href={`mailto:${BRANDING.supportEmail}`}
                  className="font-medium text-[color:var(--accent)] underline-offset-2 hover:underline"
                >
                  {BRANDING.supportEmail}
                </a>
                .
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

PilotInfoModal.displayName = "PilotInfoModal";
