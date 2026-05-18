/**
 * Shared SaaS button variants — keep export/primary/success visually distinct.
 */

const btnBase =
  "inline-flex items-center justify-center rounded-xl font-medium transition duration-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export const btnPrimary =
  `${btnBase} bg-slate-900 px-5 py-2.5 text-sm text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:bg-slate-800 hover:shadow-md focus-visible:ring-slate-400/40`;

export const btnPrimarySm =
  `${btnBase} bg-slate-900 px-4 py-2 text-sm text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:bg-slate-800 hover:shadow-md focus-visible:ring-slate-400/40`;

export const btnSecondary =
  `${btnBase} border border-[color:var(--border-default)] bg-[color:var(--surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] shadow-[var(--shadow-sm)] hover:border-slate-300/80 hover:text-[var(--foreground)] hover:shadow-[var(--shadow-md)] focus-visible:ring-slate-300/50`;

export const btnExport =
  `${btnBase} bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(67,56,202,0.25)] hover:bg-indigo-700 hover:shadow-md focus-visible:ring-indigo-400/45`;

export const btnExportSm =
  `${btnBase} bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(67,56,202,0.25)] hover:bg-indigo-700 hover:shadow-md focus-visible:ring-indigo-400/45`;

/** Success confirmations only (mapping saved, upload OK banners use separate styles). */
export const btnSuccess =
  `${btnBase} bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(5,150,105,0.25)] hover:bg-emerald-700 hover:shadow-md focus-visible:ring-emerald-400/40`;
