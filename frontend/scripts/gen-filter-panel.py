from pathlib import Path

root = Path("frontend/app")
page = (root / "page.tsx").read_text(encoding="utf-8")
start = page.index("function DashboardExplorerBar(")
end = page.index("type DataPreviewProfileAnchor", start)
body = page[start:end]
body = body.replace("function DashboardExplorerBar", "function FilterPanelInner")

header = '''"use client";

import { memo, useCallback, useMemo } from "react";
import {
  type DashboardDimensionOptions,
  type DashboardFilterEntry,
} from "@/app/dashboard-filter-types";
import { useDevRenderCount } from "@/lib/dev-render-count";

'''

footer = """

export const FilterPanel = memo(FilterPanelInner);
FilterPanel.displayName = "FilterPanel";
"""

# Inject useDevRenderCount at start of function body (after opening brace of FilterPanelInner)
needle = "}) {\n"
idx = body.index(needle) + len(needle)
body = body[:idx] + "  useDevRenderCount(\"FilterPanel\");\n" + body[idx:]

# Memoize breadcrumb segments
old = """            {filterBreadcrumb
              .split(/\\s*(?:›|\\u203a|->)\\s*/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((seg, i) => ("""
new = """            {breadcrumbSegments.map((seg, i) => ("""

if old not in body:
    raise SystemExit("breadcrumb pattern not found")

body = body.replace(old, new, 1)

insert_after_label = "  const labelCls =\n    \"block min-h-[18px] text-[11px] font-semibold uppercase tracking-wide text-slate-500\";\n\n"
breadcrumb_block = """  const breadcrumbSegments = useMemo(
    () =>
      filterBreadcrumb
        .split(/\\s*(?:›|\\u203a|->)\\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    [filterBreadcrumb]
  );

"""

if insert_after_label not in body:
    raise SystemExit("labelCls anchor not found")

body = body.replace(insert_after_label, insert_after_label + breadcrumb_block, 1)

# useCallback for date chip clear - wrap inline handler
old_date_btn = """                onClick={() => {
                  onDateStart("");
                  onDateEnd("");
                }}"""
new_date_btn = """                onClick={clearDateRange}"""
if old_date_btn in body:
    body = body.replace(old_date_btn, new_date_btn, 1)
    hook = """  const clearDateRange = useCallback(() => {
    onDateStart("");
    onDateEnd("");
  }, [onDateStart, onDateEnd]);

"""
    body = body.replace(breadcrumb_block, breadcrumb_block + hook, 1)

out = header + body + footer
(root / "components/home/filter-panel.tsx").write_text(out, encoding="utf-8")
print("Wrote filter-panel", len(out))
