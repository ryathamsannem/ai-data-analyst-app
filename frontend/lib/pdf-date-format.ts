/**
 * PDF export dates — always YYYY-MM-DD with zero-padded month/day.
 */

/** Fix locale-broken dates (2,026-2-4) and normalize embedded dates to YYYY-MM-DD. */
export function normalizePdfIsoDatesInText(raw: string): string {
  let t = raw;
  t = t.replace(
    /(\d{1,4}(?:,\d{3})*)-(\d{1,2})-(\d{1,2})\b/g,
    (_, y, m, d) => {
      const year = String(y).replace(/,/g, "");
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  );
  t = t.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (_, y, m, d) => {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
  return t;
}

/** Parse a category/date label to YYYY-MM-DD when possible. */
export function parsePdfIsoDateLabel(label: string): string | null {
  const t = label.trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const broken = t.match(/^(\d{1,4}(?:,\d{3})*)-(\d{1,2})-(\d{1,2})/);
  if (broken) {
    const year = broken[1].replace(/,/g, "");
    return `${year}-${String(broken[2]).padStart(2, "0")}-${String(broken[3]).padStart(2, "0")}`;
  }
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed) && /[/-]/.test(t)) {
    const d = new Date(parsed);
    if (d.getFullYear() >= 1990 && d.getFullYear() <= 2100) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
  }
  return null;
}

export function formatPdfDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Cover/footer timestamp: YYYY-MM-DD plus local time. */
export function formatPdfGeneratedTimestamp(d: Date): string {
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatPdfDateFromDate(d)} ${time}`;
}
