"use client";

import {
  formatIntentDimensionLabel,
  formatIntentMetricLabel,
  requestedMetricsList,
  SHOW_INTENT_DEBUG,
  type AnalysisIntentPayload,
} from "@/lib/analysis-intent-debug";

type IntentEngineDebugPanelProps = {
  intent: AnalysisIntentPayload | null | undefined;
  routingConfidence?: string | null;
};

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-violet-600/90 dark:text-violet-300/90">
        {label}
      </dt>
      <dd className="text-sm text-slate-800 dark:text-[color:var(--insights-text-secondary)] break-words font-mono text-[12px] leading-relaxed">
        {value || "—"}
      </dd>
    </div>
  );
}

export function IntentEngineDebugPanel({
  intent,
  routingConfidence,
}: IntentEngineDebugPanelProps) {
  if (!SHOW_INTENT_DEBUG) return null;

  const requested = requestedMetricsList(intent ?? null);
  const reasons = intent?.support?.reasonCodes ?? [];
  const derived = intent?.derivedMetricCandidate;

  return (
    <details className="mt-4 pt-4 border-t border-violet-200/70 dark:border-violet-500/30 group/intent-debug">
      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300 select-none">
        <span className="inline-flex items-center gap-2">
          Intent Engine Debug
          <span className="text-slate-400 font-normal normal-case tracking-normal text-xs group-open/intent-debug:hidden">
            (expand)
          </span>
        </span>
      </summary>
      <div className="mt-3 rounded-lg border border-violet-200/60 bg-violet-50/40 dark:border-violet-500/25 dark:bg-violet-950/20 p-3">
        {!intent ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No <code className="font-mono">analysis.intent</code> on this response.
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <DebugRow label="Primary goal" value={intent.primaryGoal ?? "—"} />
            <DebugRow label="Metric" value={formatIntentMetricLabel(intent)} />
            <DebugRow label="Dimension" value={formatIntentDimensionLabel(intent)} />
            <DebugRow
              label="Requested metrics"
              value={requested.length ? requested.join(", ") : "—"}
            />
            <DebugRow
              label="Support status"
              value={
                intent.support?.supported === true
                  ? "supported"
                  : intent.support?.supported === false
                    ? "unsupported"
                    : "—"
              }
            />
            <DebugRow
              label="Reason codes"
              value={reasons.length ? reasons.join(", ") : "—"}
            />
            <DebugRow
              label="Derived metric candidate"
              value={
                derived?.id
                  ? `${derived.id}${derived.computable === false ? " (not computable)" : ""}`
                  : "—"
              }
            />
            <DebugRow
              label="Routing confidence"
              value={routingConfidence?.trim() || "—"}
            />
            {intent.chart?.routingBucket ? (
              <DebugRow
                label="Intent routing bucket"
                value={intent.chart.routingBucket}
              />
            ) : null}
            {intent.chart?.legacyRoutingBucket &&
            intent.chart.legacyRoutingBucket !== intent.chart.routingBucket ? (
              <DebugRow
                label="Legacy routing bucket"
                value={intent.chart.legacyRoutingBucket}
              />
            ) : null}
          </dl>
        )}
      </div>
    </details>
  );
}
