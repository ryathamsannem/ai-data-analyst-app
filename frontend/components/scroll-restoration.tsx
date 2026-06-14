"use client";

import { useLayoutEffect } from "react";

/** Inline bootstrap: disable browser scroll restore and jump to top before paint. */
export const SCROLL_RESTORATION_BOOTSTRAP = `
(function() {
  try {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  } catch (e) {}
})();
`;

export function ScrollRestorationScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: SCROLL_RESTORATION_BOOTSTRAP }}
      suppressHydrationWarning
    />
  );
}

/** Reinforce scroll position after hydration on full page load / refresh. */
export function ScrollRestoration() {
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return null;
}
