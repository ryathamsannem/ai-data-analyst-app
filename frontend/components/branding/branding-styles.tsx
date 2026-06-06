"use client";

import { useLayoutEffect } from "react";
import { BRANDING, brandingCssVariables } from "@/lib/branding-config";

/** Applies global brand colors to CSS variables (no localStorage). */
export function BrandingStyles() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const vars = brandingCssVariables(BRANDING);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, []);

  return null;
}
