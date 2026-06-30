/**
 * PDF export dates — always YYYY-MM-DD with zero-padded month/day.
 */

const PDF_DATE_COLUMN_RE =
  /(?:^|_)(?:date|month|day|time|timestamp|period|posted_at|created_at|updated_at)(?:$|_)|^(?:report_month|list_date|claim_date|billing_month|transaction_date|order_date)$/i;

const PDF_IDENTIFIER_COLUMN_RE =
  /(?:^|_)(?:id|uuid|key|ref|reference|code|sku)(?:$|_)|(?:^|_)(?:order|customer|transaction|invoice|account|user|member|record|property)(?:_)?(?:id|no|num|number|code|key)(?:$|_)/i;

const PDF_IDENTIFIER_VALUE_RE =
  /^[A-Za-z]{2,}[-_][A-Za-z0-9][-A-Za-z0-9]*$/;

/** Column names that should receive date normalization in PDF tables. */
export function pdfColumnNameLooksLikeDate(column: string): boolean {
  const c = column.trim().toLowerCase().replace(/\s+/g, "_");
  if (!c) return false;
  return PDF_DATE_COLUMN_RE.test(c);
}

/** Column names that should never be auto-formatted as dates in PDF tables. */
export function pdfColumnNameLooksLikeIdentifier(column: string): boolean {
  const c = column.trim().toLowerCase().replace(/\s+/g, "_");
  if (!c) return false;
  if (pdfColumnNameLooksLikeDate(c)) return false;
  return PDF_IDENTIFIER_COLUMN_RE.test(c);
}

/** Cell values that look like stable identifiers (e.g. ACC-000001), not dates. */
export function pdfValueLooksLikeIdentifier(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (PDF_IDENTIFIER_VALUE_RE.test(t)) return true;
  if (/^[A-Za-z]+\d{3,}$/.test(t)) return true;
  return false;
}

/** Whether PDF table cell formatting should apply ISO/date normalization. */
export function shouldFormatPdfCellAsDate(
  columnName: string | null | undefined,
  rawValue: string
): boolean {
  const col = (columnName ?? "").trim();
  const value = rawValue.trim();
  if (!value) return false;
  if (pdfValueLooksLikeIdentifier(value)) return false;
  if (col && pdfColumnNameLooksLikeIdentifier(col)) return false;
  if (col && pdfColumnNameLooksLikeDate(col)) return true;
  return /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/i.test(value);
}

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
  if (pdfValueLooksLikeIdentifier(t)) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const broken = t.match(/^(\d{1,4}(?:,\d{3})*)-(\d{1,2})-(\d{1,2})/);
  if (broken) {
    const year = broken[1].replace(/,/g, "");
    return `${year}-${String(broken[2]).padStart(2, "0")}-${String(broken[3]).padStart(2, "0")}`;
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
