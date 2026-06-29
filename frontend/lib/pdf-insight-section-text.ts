export type PdfInsightStructuredSection =
  | "executive_takeaway"
  | "evidence"
  | "why_this_matters"
  | "supporting_detail"
  | "strategic_recommendation";

const SECTION_LEAD_LABELS: Record<PdfInsightStructuredSection, RegExp> = {
  executive_takeaway: /^(?:executive\s+takeaway|takeaway)\s*:\s*/i,
  evidence: /^evidence\s*:\s*/i,
  why_this_matters: /^why\s+this\s+matters\s*:\s*/i,
  supporting_detail: /^(?:supporting\s+detail|more\s+detail)\s*:\s*/i,
  strategic_recommendation:
    /^(?:strategic\s+recommendation|recommended\s+(?:action|next\s+actions?))\s*:\s*/i,
};

const ANY_SECTION_LEAD_LABEL =
  /^(?:executive\s+takeaway|takeaway|evidence|why\s+this\s+matters|supporting\s+detail|more\s+detail|strategic\s+recommendation|recommended\s+(?:action|next\s+actions?))\s*:\s*/i;

const TRAILING_SECTION_LABEL_LEAK =
  /\s+(?:Evidence|Executive takeaway|Takeaway|Why this matters|Supporting detail|Strategic recommendation|Recommended action)\s*:\s*$/i;

function stripListMarker(line: string): string {
  return line.replace(/^[-•*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

/** Remove redundant in-body section labels when PDF already renders a section heading. */
export function stripRedundantPdfInsightSectionLabel(
  text: string,
  section: PdfInsightStructuredSection
): string {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const ownLead = SECTION_LEAD_LABELS[section];
  const lines = raw.split(/\n+/).map((line) => stripListMarker(line.trim())).filter(Boolean);

  const cleaned = lines
    .map((line) => {
      let s = line.replace(ownLead, "");
      if (ANY_SECTION_LEAD_LABEL.test(s)) {
        s = s.replace(ANY_SECTION_LEAD_LABEL, "");
      }
      return s.trim();
    })
    .filter(Boolean);

  if (!cleaned.length) return "";

  let joined = cleaned.join(" ").replace(/\s+/g, " ").trim();
  joined = joined.replace(TRAILING_SECTION_LABEL_LEAK, "").trim();
  return joined;
}
