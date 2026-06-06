"use client";

import { memo } from "react";
import { BRANDING, getBrandInitials } from "@/lib/branding-config";

type BrandMarkProps = {
  size?: "sm" | "md";
  className?: string;
  showInitials?: boolean;
};

export const BrandMark = memo(function BrandMark({
  size = "md",
  className = "",
  showInitials = true,
}: BrandMarkProps) {
  const dim = size === "sm" ? "h-8 w-8 rounded-lg text-xs" : "h-9 w-9 rounded-xl text-sm";
  const logo = BRANDING.logoUrl?.trim();

  if (logo) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden bg-[color:var(--surface-elevated)] ${dim} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          className="h-full w-full object-contain p-1"
        />
      </span>
    );
  }

  if (!showInitials) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] text-[color:var(--accent-fg)] shadow-[0_0_20px_-4px_var(--accent-glow)] ${dim} ${className}`}
        aria-hidden
      >
        <ChartIcon />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center font-semibold tracking-tight bg-[color:var(--accent)] text-[color:var(--accent-fg)] shadow-[0_0_20px_-4px_var(--accent-glow)] ${dim} ${className}`}
      aria-hidden
    >
      {getBrandInitials()}
    </span>
  );
});

BrandMark.displayName = "BrandMark";

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 14l4-6 4 4 4-6 4 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
