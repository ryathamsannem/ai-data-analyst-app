/**
 * PDF executive content planning — deduplication and lens-aware hierarchy (Phase 1 polish).
 */

export type PdfInsightSectionsSlice = {
  summary?: string;
  statistical?: string;
  hypotheses?: string;
  recommendations?: string;
};

export type PdfRankedSignalSlice = {
  rank: string;
  category: string;
  valueDisplay: string;
};

export type PdfVizExecutiveFactSlice = {
  title: string;
  value: string;
  hint?: string;
  /** Ranked insight kind when available (concentration, risk, opportunity, gap, …). */
  kind?: string;
};

export type PdfChartIntelSliceInput = {
  recommendedLabel?: string | null;
  whyThisChart?: string | null;
  recommendationBlurb?: string | null;
};

export type PdfRoutingPlanSliceInput = {
  intent?: string;
  executiveLens?: string | null;
};

export type PdfExecutiveLens =
  | "risk"
  | "opportunity"
  | "strategy"
  | "loss"
  | "standout"
  | null;

export type PdfLensSection = {
  heading: string;
  body: string;
};

export type PdfChartIntelBlocks = {
  whySelected: string;
  interpretation: string;
  suitability: string;
};

export type PdfExecutiveHierarchy = {
  executiveSummary: string | null;
  businessInterpretation: string | null;
  strategicRecommendation: string | null;
};

export type PdfExecutiveContentPlan = {
  lens: PdfExecutiveLens;
  snapshotTagline: string | null;
  suppressDominantInsight: boolean;
  execSummaryChartHighlights: string | null;
  suppressHighlightedSignals: boolean;
  highlightedSignals: string[];
  hierarchy: PdfExecutiveHierarchy;
  confidenceRationale: string | null;
  chartIntelBlocks: PdfChartIntelBlocks | null;
  lensSections: PdfLensSection[];
  vizBrief: string | null;
  vizFacts: PdfVizExecutiveFactSlice[];
  useLensExecutivePanel: boolean;
};

export type BuildPdfExecutiveContentPlanArgs = {
  question?: string;
  execSummaryLines?: string[];
  insightSections?: PdfInsightSectionsSlice | null;
  insightSummary?: string | null;
  executiveInsightsBrief?: string | null;
  pdfRankedSignals?: PdfRankedSignalSlice[] | null;
  chartInsightBadge?: string | null;
  vizExecutiveFacts?: PdfVizExecutiveFactSlice[];
  insightConfidenceLevel?: string | null;
  insightConfidenceRationale?: string | null;
  chartIntel?: PdfChartIntelSliceInput | null;
  routingPlan?: PdfRoutingPlanSliceInput | null;
  /** Pre-formatted chart highlight narrative from ranked signals. */
  chartHighlightsNarrative?: string | null;
};

const LENS_RISK_HEADINGS = [
  "Risk Summary",
  "Risk Exposure",
  "Mitigation Recommendation",
] as const;

const LENS_OPPORTUNITY_HEADINGS = [
  "Opportunity Summary",
  "Upside Potential",
  "Recommended Action",
] as const;

const LENS_STRATEGY_HEADINGS = [
  "Strategic Observation",
  "Business Recommendation",
] as const;

export function normalizePdfTextForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s%$.-]/g, "")
    .trim();
}

export function pdfTextsAreSimilar(a: string, b: string): boolean {
  const na = normalizePdfTextForDedup(a);
  const nb = normalizePdfTextForDedup(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 24 && nb.length >= 24) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  const wa = new Set(na.split(" ").filter((w) => w.length > 3));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return false;
  let inter = 0;
  wa.forEach((w) => {
    if (wb.has(w)) inter += 1;
  });
  const union = wa.size + wb.size - inter;
  return union > 0 && inter / union >= 0.55;
}

export function resolvePdfExecutiveLens(
  routingPlan?: PdfRoutingPlanSliceInput | null
): PdfExecutiveLens {
  const lens = String(routingPlan?.executiveLens ?? "")
    .trim()
    .toLowerCase();
  if (lens === "risk") return "risk";
  if (lens === "opportunity") return "opportunity";
  if (lens === "strategy") return "strategy";
  if (lens === "loss") return "loss";
  if (lens === "standout") return "standout";
  const intent = String(routingPlan?.intent ?? "").trim().toLowerCase();
  if (intent === "profitability") return "loss";
  if (intent === "outlier") return "standout";
  return null;
}

function extractMainTakeaway(lines: string[]): string {
  for (const line of lines) {
    const s = line.trim();
    if (/^main takeaway:/i.test(s)) {
      return s.replace(/^main takeaway:\s*/i, "").trim();
    }
  }
  return "";
}

function joinUniqueParagraphs(
  parts: Array<string | null | undefined>,
  against: string[]
): string | null {
  const out: string[] = [];
  for (const raw of parts) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    if (against.some((ref) => pdfTextsAreSimilar(t, ref))) continue;
    if (out.some((prev) => pdfTextsAreSimilar(t, prev))) continue;
    out.push(t);
  }
  return out.length ? out.join("\n\n") : null;
}

function factBody(fact: PdfVizExecutiveFactSlice): string {
  const value = fact.value.trim();
  const hint = fact.hint?.trim();
  return hint ? `${value} — ${hint}` : value;
}

/** PDF lens copy polish — terminology only. */
export function polishLensSectionCopy(text: string): string {
  return String(text ?? "")
    .replace(/\bcitys\b/gi, "cities")
    .replace(/\bregion s\b/gi, "regions")
    .replace(/\s+/g, " ")
    .trim();
}

function isDominanceObservation(text: string): boolean {
  return /dominates performance|contributes \d+(?:\.\d+)?% of .+ and dominates/i.test(
    text
  );
}

function isConcentrationObservation(text: string): boolean {
  return /concentration risk|accounts for \d+(?:\.\d+)?% of total|contributes \d+(?:\.\d+)?% of/i.test(
    text
  );
}

function hasActionLead(text: string): boolean {
  return /^(monitor|diversify|prioriti|invest|mitigate|review|validate|rebalance|target|evaluate|set\s+near|cap\s+|address|strengthen|reduce|expand)\b/i.test(
    text.trim()
  );
}

/** True when a token is a metric value, not a business entity (city, region, product, …). */
export function looksLikeMetricToken(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 48) return false;
  if (/^\d+(?:\.\d+)?%$/.test(t)) return true;
  if (/^[\d,.]+(?:[kmb]|m|bn)?$/i.test(t) && /\d/.test(t)) return true;
  if (/^point\s*\d+$/i.test(t)) return true;
  if (/^[\d,.]+(?:[kmb]|m|bn)?\s*(?:[-–]|to)\s*[\d,.]+(?:[kmb]|m|bn)?$/i.test(t)) {
    return true;
  }
  return false;
}

/** Extract a segment/city/region/product label from lens narrative text. */
export function extractBusinessEntityFromLensBody(body: string): string | null {
  const polished = polishLensSectionCopy(body);
  if (!polished) return null;

  const beforeDash = polished.split(/[—–]/)[0]?.trim();
  if (
    beforeDash &&
    beforeDash.length >= 2 &&
    beforeDash.length <= 44 &&
    !looksLikeMetricToken(beforeDash) &&
    !/^(the|a|an|in this sample)$/i.test(beforeDash)
  ) {
    return beforeDash;
  }

  const patterns = [
    /\b([A-Za-z][A-Za-z0-9\s&'.-]{1,40}?)\s+may represent\b/i,
    /\b([A-Za-z][A-Za-z0-9\s&'.-]{1,40}?)\s+accounts for\b/i,
    /\b([A-Za-z][A-Za-z0-9\s&'.-]{1,40}?)\s+has the weakest\b/i,
    /\b([A-Za-z][A-Za-z0-9\s&'.-]{1,40}?)\s+shows the lowest\b/i,
    /suggests\s+([A-Za-z][A-Za-z0-9\s&'.-]{1,40}?)\s+has\b/i,
  ];

  for (const re of patterns) {
    const m = polished.match(re);
    const candidate = m?.[1]?.trim().replace(/^(the|in this sample)\s+/i, "").trim();
    if (candidate && candidate.length >= 2 && !looksLikeMetricToken(candidate)) {
      return candidate;
    }
  }

  const leadsBy = polished.match(
    /\b([A-Za-z][A-Za-z0-9\s&'.-]+?)\s+leads\s+([A-Za-z][A-Za-z0-9\s&'.-]+?)\s+by\b/i
  );
  if (leadsBy?.[2] && !looksLikeMetricToken(leadsBy[2].trim())) {
    return leadsBy[2].trim();
  }

  return null;
}

export type LensActionContext = {
  leader: string | null;
  lagger: string | null;
};

const ENTITY_TOKEN =
  "([A-Za-z][A-Za-z0-9\\s&'.-]{1,40}?)";

/** Infer leader/lagger entities from ranked lens facts (schema-driven labels only). */
export function inferLeaderLaggerFromFacts(
  facts: PdfVizExecutiveFactSlice[]
): LensActionContext {
  let leader: string | null = null;
  let lagger: string | null = null;

  for (const fact of facts) {
    const body = polishLensSectionCopy(factBody(fact));
    if (!body) continue;

    const leadsBy = body.match(
      new RegExp(`\\b${ENTITY_TOKEN}\\s+leads\\s+${ENTITY_TOKEN}\\s+by\\b`, "i")
    );
    if (leadsBy?.[1] && leadsBy?.[2]) {
      const lead = leadsBy[1].trim();
      const lag = leadsBy[2].trim();
      if (!looksLikeMetricToken(lead) && !looksLikeMetricToken(lag)) {
        leader = lead;
        lagger = lag;
      }
    }

    const uplift = body.match(
      new RegExp(`\\b${ENTITY_TOKEN}\\s+may represent\\b`, "i")
    );
    if (uplift?.[1]) {
      const lag = uplift[1].trim().replace(/^(the|in this sample)\s+/i, "").trim();
      if (lag && !looksLikeMetricToken(lag)) {
        lagger = lag;
      }
    }

    const dominates = body.match(
      new RegExp(
        `\\b${ENTITY_TOKEN}\\s+(?:contributes|accounts for|dominates|generates the highest)\\b`,
        "i"
      )
    );
    if (dominates?.[1]) {
      const lead = dominates[1].trim();
      if (lead && !looksLikeMetricToken(lead)) {
        leader = leader || lead;
      }
    }

    const trailsAt = body.match(
      new RegExp(`\\b(?:trails at|lowest at)\\s+${ENTITY_TOKEN}\\b`, "i")
    );
    if (trailsAt?.[1]) {
      const lag = trailsAt[1].trim();
      if (lag && !looksLikeMetricToken(lag)) {
        lagger = lagger || lag;
      }
    }

    const entityTrails = body.match(
      new RegExp(`\\b${ENTITY_TOKEN}\\s+trails\\b`, "i")
    );
    if (entityTrails?.[1]) {
      const lag = entityTrails[1].trim();
      if (lag && !looksLikeMetricToken(lag)) {
        lagger = lagger || lag;
      }
    }

    const valueEntity = String(fact.value ?? "").trim();
    if (
      valueEntity &&
      !looksLikeMetricToken(valueEntity) &&
      /weakest|lowest|growth risk|trails|lagging|uplift|opportunity/i.test(body)
    ) {
      if (/weakest|lowest|trails|lagging|uplift|opportunity/i.test(body)) {
        lagger = lagger || valueEntity;
      }
    }
  }

  return { leader, lagger };
}

function resolveOpportunityInvestmentTarget(
  body: string,
  context: LensActionContext
): string | null {
  let target = context.lagger;

  if (!target) {
    const uplift = body.match(new RegExp(`\\b${ENTITY_TOKEN}\\s+may represent\\b`, "i"));
    if (uplift?.[1] && !looksLikeMetricToken(uplift[1].trim())) {
      target = uplift[1].trim();
    }
  }

  if (!target) {
    const lagged = body.match(
      new RegExp(`\\bleads\\s+${ENTITY_TOKEN}\\s+by\\b`, "i")
    );
    if (lagged?.[1] && !looksLikeMetricToken(lagged[1].trim())) {
      target = lagged[1].trim();
    }
  }

  if (
    target &&
    context.leader &&
    target.toLowerCase() === context.leader.toLowerCase()
  ) {
    target = context.lagger;
  }

  if (
    target &&
    context.leader &&
    target.toLowerCase() === context.leader.toLowerCase()
  ) {
    return null;
  }

  return target;
}

function inferPeerGroupLabel(
  body: string,
  entities?: { leader?: string | null; lagger?: string | null }
): string {
  const lower = body.toLowerCase();
  const names = [entities?.leader, entities?.lagger]
    .filter(Boolean)
    .map((name) => String(name).trim().toLowerCase());
  if (
    names.some((name) =>
      /^(north|south|east|west|central|northeast|northwest|southeast|southwest)$/.test(
        name
      )
    )
  ) {
    return "peer regions";
  }
  if (/region|zone|territory/.test(lower)) return "peer regions";
  if (/city|cities|metro/.test(lower)) return "peer cities";
  if (/product|sku|category/.test(lower)) return "peer categories";
  if (/segment/.test(lower)) return "peer segments";
  return "peers";
}

function parseLeaderGapNarrative(body: string): {
  leader: string;
  lagger: string;
  gapAmount: string | null;
  metric: string | null;
} | null {
  const polished = polishLensSectionCopy(body);
  const narrative = polished.replace(/^[\d,.]+(?:[kmb]|%|m|bn)?\s*[—–-]\s*/i, "").trim();
  const match = narrative.match(
    new RegExp(
      `\\b${ENTITY_TOKEN}\\s+leads\\s+${ENTITY_TOKEN}\\s+by\\s+([\\d,.]+(?:[kmb]|m|bn)?|\\$[\\d,.]+(?:[kmb]|m|bn)?)(?:\\s*\\((\\d+(?:\\.\\d+)?)%\\s*(?:spread|gap)\\))?\\s*(?:on\\s+([\\w\\s]+))?`,
      "i"
    )
  );
  if (!match?.[1] || !match?.[2]) return null;
  const leader = match[1].trim();
  const lagger = match[2].trim();
  if (looksLikeMetricToken(leader) || looksLikeMetricToken(lagger)) return null;
  const gapAmount = match[3]?.trim() || null;
  const metric = match[5]?.trim().replace(/\.$/, "") || null;
  return { leader, lagger, gapAmount, metric };
}

/** Reframe leader-gap observations as lagger-focused opportunity narratives. */
export function rewriteOpportunityLensNarrative(
  body: string,
  context: LensActionContext,
  heading: string
): string {
  const polished = polishLensSectionCopy(body);
  if (!polished) return polished;

  if (
    /\btrails\b/i.test(polished) &&
    /\b(upside|potential|opportunity|peers?)\b/i.test(polished)
  ) {
    return polished;
  }

  const parsed = parseLeaderGapNarrative(polished);
  const lagger =
    context.lagger ||
    parsed?.lagger ||
    extractBusinessEntityFromLensBody(polished);
  if (!lagger || looksLikeMetricToken(lagger)) return polished;

  const gapAmount = parsed?.gapAmount;
  const metric = parsed?.metric;
  const peers = inferPeerGroupLabel(polished, {
    leader: context.leader || parsed?.leader || null,
    lagger,
  });
  const gapClause = gapAmount ? ` by ${gapAmount}` : "";
  const metricClause = metric ? ` in ${metric}` : "";

  if (heading === "Upside Potential") {
    return `${lagger} trails ${peers}${gapClause}${metricClause}, suggesting significant upside potential if performance improves.`;
  }

  if (heading === "Opportunity Summary") {
    if (/may represent.*uplift|opportunity/i.test(polished)) {
      return polished;
    }
    return `${lagger} represents the largest uplift opportunity${gapClause}${metricClause} relative to ${peers}.`;
  }

  return polished;
}

function buildOpportunityRecommendedAction(
  body: string,
  context: LensActionContext
): string {
  const target = resolveOpportunityInvestmentTarget(body, context);
  if (target) {
    return `Focus investment on ${target} where the revenue gap suggests the largest upside opportunity.`;
  }
  return `Evaluate targeted growth initiatives in lagging segments before allocating additional investment to already dominant regions.`;
}

function buildRiskMitigationAction(
  body: string,
  context: LensActionContext
): string {
  let entity = context.leader;
  if (!entity) {
    entity =
      body.match(new RegExp(`\\b${ENTITY_TOKEN}\\s+accounts for\\b`, "i"))?.[1]?.trim() ||
      body.match(new RegExp(`\\b${ENTITY_TOKEN}\\s+contributes\\b`, "i"))?.[1]?.trim() ||
      extractBusinessEntityFromLensBody(body);
  }
  if (entity && !looksLikeMetricToken(entity)) {
    return `Diversify revenue sources beyond ${entity} and establish contingency plans to reduce concentration risk.`;
  }
  return `Diversify revenue sources across secondary markets and establish contingency plans to reduce concentration risk.`;
}

function buildRiskGrowthMitigationAction(
  body: string,
  context: LensActionContext
): string {
  const entity =
    context.lagger ||
    extractBusinessEntityFromLensBody(body) ||
    String(body.split(/[—–]/)[0] ?? "").trim();
  if (entity && !looksLikeMetricToken(entity)) {
    return `Monitor and mitigate downside in ${entity} while strengthening growth initiatives across lagging segments.`;
  }
  return `Monitor and mitigate downside in lagging segments while diversifying growth exposure.`;
}

function buildRiskMarginMitigationAction(body: string): string {
  const entity = extractBusinessEntityFromLensBody(body);
  if (entity && !looksLikeMetricToken(entity)) {
    return `Review margin pressure and tighten controls in ${entity} and similar underperforming segments.`;
  }
  return `Review margin pressure and tighten controls in underperforming segments.`;
}

export function inferFactKind(fact: PdfVizExecutiveFactSlice): string {
  const explicit = String(fact.kind ?? "").trim().toLowerCase();
  if (explicit) return explicit;

  const title = String(fact.title ?? "").toLowerCase();
  const hint = String(fact.hint ?? "").toLowerCase();
  const combined = `${title} ${hint}`;

  if (/concentration|share of total/.test(combined)) return "concentration";
  if (/primary concern|secondary concern|watch item/.test(combined)) return "risk";
  if (/growth\s+risk|stagnat|declin|weakest\s+growth/.test(combined)) return "risk";
  if (/margin\s+risk|margin\s+pressure/.test(combined)) return "risk";
  if (/\brisk\b/.test(title)) return "risk";
  if (/opportunity|uplift|expansion\s+candidate|underperform/.test(combined)) {
    return "opportunity";
  }
  if (/gap|spread|leads .+ by/.test(combined)) return "gap";
  if (/outlier|weakest|lowest/.test(combined)) return "outlier";
  if (/ranking|leader|highest|dominates/.test(combined)) return "ranking";
  return "unknown";
}

export function rewriteObservationAsAction(
  body: string,
  lens: PdfExecutiveLens,
  heading: string,
  context: LensActionContext = { leader: null, lagger: null }
): string {
  const polished = polishLensSectionCopy(body);
  if (!polished) return polished;
  if (hasActionLead(polished)) return polished;

  const actionHeading =
    (lens === "risk" && heading === "Mitigation Recommendation") ||
    (lens === "opportunity" && heading === "Recommended Action") ||
    (lens === "strategy" && heading === "Business Recommendation");

  if (!actionHeading) return polished;

  if (lens === "opportunity" && heading === "Recommended Action") {
    if (/leads .+ by|spread|gap|uplift|opportunity|under-?indexed/i.test(polished)) {
      return buildOpportunityRecommendedAction(polished, context);
    }
    if (isDominanceObservation(polished) || isConcentrationObservation(polished)) {
      return buildOpportunityRecommendedAction(polished, context);
    }
  }

  if (
    lens === "risk" &&
    heading === "Mitigation Recommendation" &&
    (isDominanceObservation(polished) || isConcentrationObservation(polished))
  ) {
    return buildRiskMitigationAction(polished, context);
  }

  if (lens === "strategy" && (isDominanceObservation(polished) || isConcentrationObservation(polished))) {
    return `Set near-term priorities around diversification and retention alongside top performance signals.`;
  }

  if (lens === "risk" && /weakest|stagnat|declin|growth risk/i.test(polished)) {
    return buildRiskGrowthMitigationAction(polished, context);
  }

  if (
    lens === "risk" &&
    /margin risk|margin pressure|profit-to-revenue|lowest profit/i.test(polished)
  ) {
    return buildRiskMarginMitigationAction(polished);
  }

  if (lens === "strategy" && /opportunity|uplift|gap/i.test(polished)) {
    return `Prioritize investment and operating focus where uplift signals are strongest.`;
  }

  return polished;
}

type ScoredLensFact = {
  fact: PdfVizExecutiveFactSlice;
  kind: string;
  body: string;
};

function scoreFactForLensSlot(
  lens: PdfExecutiveLens,
  heading: string,
  item: ScoredLensFact
): number {
  const { kind, body } = item;
  const dominance = isDominanceObservation(body);
  const concentration = isConcentrationObservation(body);

  if (lens === "risk") {
    if (heading === "Risk Summary") {
      if (/primary concern/i.test(body)) return 92;
      if (kind === "risk" && !concentration) return 88;
      if (kind === "outlier") return 72;
      if (kind === "concentration" || dominance) return 18;
      return 42;
    }
    if (heading === "Risk Exposure") {
      if (kind === "concentration") return 90;
      if (concentration) return 84;
      if (dominance) return 58;
      return 28;
    }
    if (heading === "Mitigation Recommendation") {
      if (/weakest|stagnat|declin|growth risk/i.test(body)) return 86;
      if (kind === "outlier") return 78;
      if (kind === "risk" && !concentration) return 74;
      if (kind === "gap") return 52;
      return 36;
    }
  }

  if (lens === "opportunity") {
    if (heading === "Opportunity Summary") {
      if (kind === "opportunity") return 92;
      if (kind === "gap" && /uplift|underperform|expansion/i.test(body)) return 86;
      if (kind === "gap") return 68;
      if (kind === "concentration" || dominance) return -12;
      return 40;
    }
    if (heading === "Upside Potential") {
      if (kind === "opportunity") return 84;
      if (kind === "gap" && /leads .+ by/i.test(body)) return 78;
      if (kind === "gap" && !/leads .+ by/i.test(body)) return 66;
      if (kind === "ranking") return 48;
      if (kind === "concentration" || dominance) return -24;
      return 44;
    }
    if (heading === "Recommended Action") {
      if (kind === "opportunity") return 82;
      if (kind === "gap") return 76;
      if (kind === "concentration" || dominance) return 8;
      return 46;
    }
  }

  if (lens === "strategy") {
    if (heading === "Strategic Observation") {
      if (kind === "concentration") return 86;
      if (concentration) return 82;
      if (kind === "risk") return 74;
      if (dominance) return 62;
      return 48;
    }
    if (heading === "Business Recommendation") {
      if (kind === "opportunity") return 72;
      if (kind === "gap") return 68;
      if (dominance) return 12;
      if (kind === "concentration") return 20;
      return 40;
    }
  }

  return 0;
}

function isActionLensHeading(lens: PdfExecutiveLens, heading: string): boolean {
  return (
    (lens === "risk" && heading === "Mitigation Recommendation") ||
    (lens === "opportunity" && heading === "Recommended Action") ||
    (lens === "strategy" && heading === "Business Recommendation")
  );
}

function pickFactForHeading(
  lens: PdfExecutiveLens,
  heading: string,
  pool: ScoredLensFact[],
  usedBodies: string[],
  usedFacts: Set<ScoredLensFact>
): ScoredLensFact | null {
  let best: { item: ScoredLensFact; score: number } | null = null;
  for (const item of pool) {
    if (usedFacts.has(item)) continue;
    if (usedBodies.some((b) => pdfTextsAreSimilar(b, item.body))) continue;
    const score = scoreFactForLensSlot(lens, heading, item);
    if (score < 0) continue;
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best?.item ?? null;
}

export function buildLensExecutiveSections(
  lens: PdfExecutiveLens,
  facts: PdfVizExecutiveFactSlice[],
  strategicRecommendation: string | null
): PdfLensSection[] {
  if (!lens || lens === "loss" || lens === "standout" || !facts.length) {
    return [];
  }

  const headings: readonly string[] =
    lens === "risk"
      ? LENS_RISK_HEADINGS
      : lens === "opportunity"
        ? LENS_OPPORTUNITY_HEADINGS
        : lens === "strategy"
          ? LENS_STRATEGY_HEADINGS
          : [];

  if (!headings.length) return [];

  const pool: ScoredLensFact[] = facts
    .filter((f) => f.value?.trim())
    .map((fact) => ({
      fact,
      kind: inferFactKind(fact),
      body: polishLensSectionCopy(factBody(fact)),
    }));

  const sections: PdfLensSection[] = [];
  const usedBodies: string[] = [];
  const usedFacts = new Set<ScoredLensFact>();
  const stratRec = polishLensSectionCopy(strategicRecommendation?.trim() ?? "");
  const actionContext = inferLeaderLaggerFromFacts(facts);

  for (const heading of headings) {
    let body: string | null = null;
    let pickedFact: ScoredLensFact | null = null;

    if (
      lens === "strategy" &&
      heading === "Business Recommendation" &&
      stratRec &&
      !usedBodies.some((b) => pdfTextsAreSimilar(b, stratRec))
    ) {
      body = rewriteObservationAsAction(stratRec, lens, heading, actionContext);
    } else {
      pickedFact = pickFactForHeading(lens, heading, pool, usedBodies, usedFacts);
      if (pickedFact) {
        if (isActionLensHeading(lens, heading)) {
          const rewritten = rewriteObservationAsAction(
            pickedFact.body,
            lens,
            heading,
            actionContext
          );
          if (
            stratRec &&
            hasActionLead(stratRec) &&
            !hasActionLead(rewritten)
          ) {
            body = rewriteObservationAsAction(stratRec, lens, heading, actionContext);
          } else {
            body = rewritten;
          }
        } else {
          body =
            lens === "opportunity"
              ? rewriteOpportunityLensNarrative(
                  pickedFact.body,
                  actionContext,
                  heading
                )
              : pickedFact.body;
        }
      } else if (
        isActionLensHeading(lens, heading) &&
        stratRec &&
        !usedBodies.some((b) => pdfTextsAreSimilar(b, stratRec))
      ) {
        body = rewriteObservationAsAction(stratRec, lens, heading, actionContext);
      }
    }

    if (!body) continue;
    if (sections.some((s) => pdfTextsAreSimilar(s.body, body!))) continue;

    sections.push({ heading, body });
    usedBodies.push(body);
    if (pickedFact) usedFacts.add(pickedFact);
  }

  return sections;
}

export function buildPdfChartIntelBlocks(
  chartIntel?: PdfChartIntelSliceInput | null
): PdfChartIntelBlocks | null {
  if (!chartIntel) return null;
  const why =
    chartIntel.whyThisChart?.trim() ||
    chartIntel.recommendationBlurb?.trim() ||
    "";
  const label = chartIntel.recommendedLabel?.trim() || "";
  const interpretation = label
    ? `Read this as a ${label.toLowerCase()} view of the pattern in scope.`
    : "Use category ranking to compare relative performance before acting.";
  const suitability =
    chartIntel.recommendationBlurb?.trim() ||
    (label
      ? `${label} was selected because it matches the question structure and label density.`
      : "");
  if (!why && !suitability) return null;
  return {
    whySelected: why || suitability,
    interpretation,
    suitability: suitability || why,
  };
}

export function buildPdfExecutiveContentPlan(
  args: BuildPdfExecutiveContentPlanArgs
): PdfExecutiveContentPlan {
  const execLines = args.execSummaryLines ?? [];
  const takeaway =
    extractMainTakeaway(execLines) ||
    String(args.insightSummary ?? "").trim() ||
    String(args.executiveInsightsBrief ?? "").trim();

  const chartHighlights = String(args.chartHighlightsNarrative ?? "").trim();
  const sec = args.insightSections ?? {};
  const lens = resolvePdfExecutiveLens(args.routingPlan);
  const useLens = lens === "risk" || lens === "opportunity" || lens === "strategy";

  const dedupeRefs = [takeaway, chartHighlights].filter(Boolean);

  const statistical = sec.statistical?.trim() || null;
  const hypotheses = sec.hypotheses?.trim() || null;
  const recommendations = sec.recommendations?.trim() || null;
  const summaryRaw = sec.summary?.trim() || null;

  const businessParts: Array<string | null> = [];
  if (statistical) businessParts.push(statistical);
  if (hypotheses) businessParts.push(hypotheses);
  if (chartHighlights && !useLens) {
    businessParts.push(`Evidence from the chart: ${chartHighlights}`);
  }

  const hierarchy: PdfExecutiveHierarchy = {
    executiveSummary: joinUniqueParagraphs([summaryRaw], dedupeRefs),
    businessInterpretation: joinUniqueParagraphs(businessParts, dedupeRefs),
    strategicRecommendation: joinUniqueParagraphs(
      [recommendations],
      dedupeRefs
    ),
  };

  if (useLens && !hierarchy.businessInterpretation && statistical) {
    hierarchy.businessInterpretation = statistical;
  }

  const rawFacts = (args.vizExecutiveFacts ?? []).filter(
    (f) => f.title?.trim() && f.value?.trim()
  );
  const lensSections = buildLensExecutiveSections(
    lens,
    rawFacts,
    hierarchy.strategicRecommendation
  );

  const vizFacts = useLens
    ? rawFacts.filter((fact) => {
        const body = factBody(fact);
        return !lensSections.some((s) => pdfTextsAreSimilar(s.body, body));
      })
    : rawFacts;

  const vizBriefRaw = String(args.executiveInsightsBrief ?? "").trim();
  const vizBrief =
    vizBriefRaw && !dedupeRefs.some((r) => pdfTextsAreSimilar(vizBriefRaw, r))
      ? vizBriefRaw
      : null;

  let highlightedSignals: string[] = [];
  if (chartHighlights) {
    highlightedSignals = [chartHighlights];
  } else {
    const badge = [args.chartInsightBadge, args.insightSummary]
      .filter(Boolean)
      .join(" · ")
      .trim();
    if (badge) highlightedSignals = [badge];
  }

  const suppressHighlightedSignals =
    !highlightedSignals.length ||
    highlightedSignals.every((s) => dedupeRefs.some((r) => pdfTextsAreSimilar(s, r))) ||
    Boolean(hierarchy.businessInterpretation?.includes(chartHighlights) && chartHighlights);

  const execSummaryChartHighlights =
    chartHighlights &&
    !suppressHighlightedSignals &&
    !hierarchy.businessInterpretation
      ? chartHighlights
      : suppressHighlightedSignals
        ? null
        : chartHighlights || null;

  const snapshotTagline = takeaway
    ? takeaway.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 160) || null
    : null;

  const suppressDominantInsight =
    !snapshotTagline ||
    dedupeRefs.some((r) => pdfTextsAreSimilar(snapshotTagline, r));

  const confidenceRationale = args.insightConfidenceRationale?.trim() || null;

  return {
    lens,
    snapshotTagline: suppressDominantInsight ? null : snapshotTagline,
    suppressDominantInsight,
    execSummaryChartHighlights: execSummaryChartHighlights || null,
    suppressHighlightedSignals,
    highlightedSignals: suppressHighlightedSignals ? [] : highlightedSignals,
    hierarchy,
    confidenceRationale,
    chartIntelBlocks: buildPdfChartIntelBlocks(args.chartIntel),
    lensSections,
    vizBrief: useLens && lensSections.length ? null : vizBrief,
    vizFacts: useLens && lensSections.length ? [] : vizFacts,
    useLensExecutivePanel: useLens && lensSections.length > 0,
  };
}

export function pdfExecutiveHierarchyHeadings(): {
  summary: string;
  interpretation: string;
  recommendation: string;
} {
  return {
    summary: "Executive summary",
    interpretation: "Business interpretation",
    recommendation: "Strategic recommendation",
  };
}
