"use client";

import { useEffect, useState, type RefObject } from "react";

/** Tracks element content width via ResizeObserver (sidebar / grid reflow). */
export function useMeasuredElementWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true
): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const apply = (w: number) => {
      if (w > 0) setWidth(Math.floor(w));
    };

    apply(el.getBoundingClientRect().width);

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) apply(w);
    });
    ro.observe(el);

    const onWindowResize = () => apply(el.getBoundingClientRect().width);
    window.addEventListener("resize", onWindowResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [ref, enabled]);

  return width;
}
