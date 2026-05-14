# Agent baseline — AI Data Analyst App

Follow these rules in all future changes unless the user explicitly overrides them.

## 1. UI direction

- Keep the current **modern SaaS dashboard** look: spacing, typography, cards, and chrome.
- **Do not redesign** working layouts (Overview, AI Insights, main Charts area, Timeline, filter bar, PDF narrative blocks) unless the user asks for a redesign.
- Preserve **consistent** spacing, chart shells (`AiInsightChartShell`, shared viewport wrappers), and **filter alignment** established in the codebase.
- Treat the current structure as the **product baseline**; extend or fix in place rather than replacing whole regions.

## 2. Charts

- **Do not change chart-type logic** or semantics: same kinds across Overview, AI Insights, Charts, and PDF.
- **Horizontal bar** charts stay horizontal; do not force vertical layouts on them.
- Reuse **shared** layout helpers (`ChartInsightViewportWrapper`, `chart-renderer` / `chart-layout-config`, etc.) for centering and margins.
- Keep charts **centered**, **responsive**, and readable: avoid axis overlap and label crowding (tune margins/padding, not arbitrary one-off hacks per page).

## 3. Filters

- Keep filters **visually aligned** with the unified SaaS control height and grid behavior.
- **Date range** stays a **single grouped control** (one bordered bar, start/end fields, divider only—no redundant copy unless product asks).

## 4. Performance

- Keep **`React.memo`**, **`useMemo`**, **`useCallback`**, and **`useTransition`** where they already guard expensive trees or navigation.
- Avoid introducing **avoidable rerenders** (stable props, memoized children, no new inline object/array props on hot paths).
- Keep **heavy optional paths lazy-loaded** (e.g. PDF/html2canvas-style imports) unless there is a measured need to change that.

## 5. PDF export

- PDF charts and framing should **match the on-screen** insight styling: **centered** chart images, consistent margins, executive-report tone.
- Reuse the same capture/layout path as the UI where possible; do not regress alignment for convenience.

## 6. Engineering

- Prefer **small, scoped fixes** over broad rewrites.
- **Do not refactor** stable, working UI “for cleanliness” without explicit user approval.
- **Reuse** shared components and layout utilities instead of duplicating filter/chart/PDF structure.

## 7. UX philosophy

- Aim for a **premium analytics SaaS** experience: clarity, responsiveness, consistency, and trustworthy insights over novelty.

---

**Default stance:** if a change is cosmetic or architectural and not requested, skip it. If something is broken, fix the **narrowest** layer that owns the behavior.
