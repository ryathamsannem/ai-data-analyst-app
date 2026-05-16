"use client";

import { useEffect, useRef } from "react";

/**
 * Development-only: logs render counts to the console to spot unexpected re-renders.
 * No-ops in production builds.
 */
export function useDevRenderCount(componentName: string): void {
  const countRef = useRef(0);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    countRef.current += 1;
    console.debug(`[render] ${componentName} #${countRef.current}`);
  });
}
