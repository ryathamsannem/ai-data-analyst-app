/**
 * Shared SaaS button variants — semantic theme tokens (light/dark via globals.css).
 */

/** Secondary premium actions — matches Replace file / Review mapping (`font-medium`). */
export const saasSecondaryActionFont = "font-medium";

const btnBase =
  "inline-flex items-center justify-center rounded-[0.85rem] font-medium transition-all duration-200 ease-out active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[color:var(--btn-disabled-bg)] disabled:text-[color:var(--btn-disabled-fg)] disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]";

export const btnPrimary = `${btnBase} bg-[color:var(--btn-primary-bg)] px-5 py-2.5 text-sm text-[color:var(--btn-primary-fg)] shadow-[var(--shadow-sm)] hover:bg-[color:var(--btn-primary-hover)] hover:shadow-[var(--shadow-md)]`;

export const btnPrimarySm = "saas-btn-accent";

export const btnSecondary = "saas-btn-premium saas-btn-premium--sm";

export const btnExport =
  `${btnBase} bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-[color:var(--accent-fg)] shadow-[var(--shadow-sm)] hover:bg-[color:var(--accent-hover)] hover:shadow-[var(--shadow-md)]`;

export const btnExportSm =
  `${btnBase} bg-[color:var(--accent)] px-4 py-2.5 text-sm font-medium text-[color:var(--accent-fg)] shadow-[var(--shadow-sm)] hover:bg-[color:var(--accent-hover)] hover:shadow-[var(--shadow-md)]`;

/** Success confirmations only (mapping saved, upload OK banners). */
export const btnSuccess =
  `${btnBase} bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(5,150,105,0.25)] hover:bg-emerald-700 hover:shadow-md focus-visible:ring-emerald-400/40`;
