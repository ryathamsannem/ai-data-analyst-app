/** KPI chips shown in the cover executive snapshot panel. */
export const PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT = 3;

/** Minimum deduped cards required before rendering a separate KPI dashboard section. */
export const PDF_KPI_DASHBOARD_MIN_CARDS = 2;

export type PdfKpiCardLike = {
  title: string;
  value: string;
  subtitle?: string | null;
};

function normalizePdfKpiCardDedupeKey(card: PdfKpiCardLike): string {
  const title = card.title.trim().toLowerCase();
  const value = String(card.value ?? "").trim().toLowerCase();
  return `${title}\u001f${value}`;
}

/** KPI cards for the dashboard section — excludes cards already in the snapshot strip. */
export function pdfKpiCardsForDashboardSection(
  cards: readonly PdfKpiCardLike[],
  snapshotCount: number = PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT
): PdfKpiCardLike[] {
  if (!cards.length || snapshotCount <= 0) return [...cards];
  const snapshotKeys = new Set(
    cards
      .slice(0, snapshotCount)
      .map((card) => normalizePdfKpiCardDedupeKey(card))
  );
  return cards.filter(
    (card) => !snapshotKeys.has(normalizePdfKpiCardDedupeKey(card))
  );
}

/** True when enough non-snapshot KPI cards justify a dashboard section. */
export function shouldRenderPdfKpiDashboardSection(
  cards: readonly PdfKpiCardLike[],
  snapshotCount: number = PDF_EXECUTIVE_SNAPSHOT_KPI_COUNT
): boolean {
  return (
    pdfKpiCardsForDashboardSection(cards, snapshotCount).length >=
    PDF_KPI_DASHBOARD_MIN_CARDS
  );
}
