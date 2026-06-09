/** Pilot landing copy, nav targets, and pricing tiers (informational only). */

import {
  FREE_MAX_FILE_BYTES,
  FREE_MAX_PREVIEW_ROWS,
  PAID_MAX_FILE_BYTES,
  PAID_MAX_DATASET_ROWS,
  formatBytes,
  getPlanLimits,
} from "@/lib/plan-limits";

export const PILOT_LANDING_HERO = {
  title: "AI Data Analyst for your business data",
  subtitle:
    "Upload CSV, Excel, JSON, or Parquet files and ask questions, generate charts, and export executive PDFs.",
} as const;

export const PILOT_VALUE_CHIPS = [
  "AI Insights",
  "Follow-up Questions",
  "Executive PDF",
  "Data Preview",
  "CSV / Excel / JSON / Parquet",
] as const;

export type PilotNavTarget = "home" | "pricing" | "privacy" | "security" | "contact";

export type PilotNavLink = {
  id: PilotNavTarget;
  label: string;
  sectionId: string;
};

export const PILOT_HEADER_NAV: readonly PilotNavLink[] = [
  { id: "home", label: "Home", sectionId: "pilot-landing" },
  { id: "pricing", label: "Pricing", sectionId: "pilot-section-pricing" },
  { id: "privacy", label: "Privacy", sectionId: "pilot-section-privacy" },
  { id: "security", label: "Security", sectionId: "pilot-section-security" },
  { id: "contact", label: "Contact", sectionId: "pilot-section-contact" },
] as const;

export type PilotPricingTier = {
  name: string;
  badge?: string;
  features: string[];
};

export function buildPilotPricingTiers(): PilotPricingTier[] {
  const free = getPlanLimits("free");
  const paid = getPlanLimits("paid");
  return [
    {
      name: "Free / Trial",
      badge: "Current default",
      features: [
        `${formatBytes(FREE_MAX_FILE_BYTES)} file size`,
        `${FREE_MAX_PREVIEW_ROWS.toLocaleString()} preview rows`,
        `${free.ai_questions_limit} AI questions/day`,
        `${free.pdf_exports_limit} PDF export/day`,
      ],
    },
    {
      name: "Paid",
      badge: "Preview via plan toggle",
      features: [
        `${formatBytes(PAID_MAX_FILE_BYTES)} file size`,
        `${PAID_MAX_DATASET_ROWS.toLocaleString()} preview rows`,
        `${paid.ai_questions_limit} AI questions/month`,
        "Unlimited PDF exports",
      ],
    },
  ];
}

export const PILOT_PAYMENT_NOTE =
  "Payment integration is not enabled in this pilot.";

export const PILOT_PRIVACY_COPY = [
  "Files are processed temporarily for analysis during your session.",
  "This pilot uses in-memory dataset handling — data is not stored as a multi-tenant SaaS database.",
  "Do not upload highly sensitive or regulated data during the pilot.",
] as const;

export const PILOT_SECURITY_COPY = [
  "HTTPS is used between the browser and hosted services on Vercel and Render deployments.",
  "This pilot is intended for controlled testing with trusted users.",
  "Authentication, audit logging, and tenant isolation are planned for a later release.",
] as const;
