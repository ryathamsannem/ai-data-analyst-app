/** Shared between `page.tsx` and filter panel (avoid circular imports). */
export type DashboardFilterEntry = {
  column: string;
  label: string;
  value: string;
};

export type DimensionOptionEntry = {
  column: string;
  label: string;
  values: string[];
};

export type DashboardDimensionOptions = Partial<
  Record<"department" | "location" | "designation" | "date", DimensionOptionEntry>
>;
