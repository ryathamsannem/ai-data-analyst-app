"use client";

import { memo } from "react";
import {
  PILOT_PAYMENT_NOTE,
  PILOT_PRIVACY_COPY,
  PILOT_SECURITY_COPY,
  buildPilotPricingTiers,
} from "@/lib/pilot-landing";
import { BRANDING } from "@/lib/branding-config";
import { ovCard, ovMuted, ovSectionTitle } from "@/lib/overview-ui";

const sectionClass =
  "scroll-mt-24 rounded-2xl border border-[color:var(--border-default)] bg-[color:color-mix(in_srgb,var(--surface-elevated)_88%,transparent)] p-5 sm:p-6";

export const PilotInfoSections = memo(function PilotInfoSections() {
  const tiers = buildPilotPricingTiers();

  return (
    <div className="mt-8 space-y-5 sm:mt-10">
      <section id="pilot-section-pricing" className={sectionClass}>
        <h2 className={ovSectionTitle}>Pricing</h2>
        <p className={`mt-2 text-sm ${ovMuted}`}>
          Informational preview only — use the header plan toggle to explore Free vs Paid
          limits. {PILOT_PAYMENT_NOTE}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={`${ovCard} p-4`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{tier.name}</h3>
                {tier.badge ? (
                  <span className="rounded-full border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)]">
                    {tier.badge}
                  </span>
                ) : null}
              </div>
              <ul className={`mt-3 space-y-1.5 text-sm ${ovMuted}`}>
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
      </section>

      <section id="pilot-section-privacy" className={sectionClass}>
        <h2 className={ovSectionTitle}>Privacy</h2>
        <ul className={`mt-3 space-y-2 text-sm leading-relaxed ${ovMuted}`}>
          {PILOT_PRIVACY_COPY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section id="pilot-section-security" className={sectionClass}>
        <h2 className={ovSectionTitle}>Security</h2>
        <ul className={`mt-3 space-y-2 text-sm leading-relaxed ${ovMuted}`}>
          {PILOT_SECURITY_COPY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section id="pilot-section-contact" className={sectionClass}>
        <h2 className={ovSectionTitle}>Contact</h2>
        <p className={`mt-3 text-sm leading-relaxed ${ovMuted}`}>
          Questions about the pilot, limits, or deployment? Reach us at{" "}
          <a
            href={`mailto:${BRANDING.supportEmail}`}
            className="font-medium text-[color:var(--accent)] underline-offset-2 hover:underline"
          >
            {BRANDING.supportEmail}
          </a>
          .
        </p>
      </section>
    </div>
  );
});

PilotInfoSections.displayName = "PilotInfoSections";
