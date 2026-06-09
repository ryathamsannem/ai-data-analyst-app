"use client";

import { memo } from "react";
import {
  PILOT_HEADER_NAV,
  type PilotNavTarget,
} from "@/lib/pilot-landing";

function navLinkClass(isActive: boolean): string {
  const base =
    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors";
  if (isActive) {
    return `${base} bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--surface-subtle))] text-[color:var(--accent)] dark:bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] dark:text-[color:color-mix(in_srgb,#c4b5fd_92%,#fff)]`;
  }
  return `${base} text-[color:var(--text-muted)] hover:bg-[color:var(--surface-subtle)] hover:text-foreground`;
}

export const HeaderNavLinks = memo(function HeaderNavLinks({
  activeNav,
  onNavigate,
}: {
  activeNav: PilotNavTarget | null;
  onNavigate: (target: PilotNavTarget) => void;
}) {
  return (
    <nav
      className="hidden items-center gap-0.5 lg:flex"
      aria-label="Product navigation"
    >
      {PILOT_HEADER_NAV.map((link) => {
        const isActive = activeNav === link.id;
        return (
          <button
            key={link.id}
            type="button"
            onClick={() => onNavigate(link.id)}
            className={navLinkClass(isActive)}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </button>
        );
      })}
    </nav>
  );
});

HeaderNavLinks.displayName = "HeaderNavLinks";
