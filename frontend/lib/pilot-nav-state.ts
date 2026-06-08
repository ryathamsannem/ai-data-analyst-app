import type { PilotNavTarget } from "@/lib/pilot-landing";

export type MainTabForPilotNav = "overview" | "preview" | "insights" | "charts" | "export";

export function resolvePilotNavActive(input: {
  activeTab: MainTabForPilotNav;
  pilotInfoModal: Exclude<PilotNavTarget, "home"> | null;
  pilotNavHighlight: PilotNavTarget;
}): PilotNavTarget | null {
  if (input.activeTab !== "overview") return null;
  if (input.pilotInfoModal) return input.pilotInfoModal;
  return input.pilotNavHighlight;
}

/** V1: header search is not wired to any filter action — hide entirely. */
export function shouldShowHeaderSearch(_datasetLoaded: boolean): boolean {
  return false;
}

export function pilotInfoModalTitle(section: Exclude<PilotNavTarget, "home">): string {
  const titles: Record<Exclude<PilotNavTarget, "home">, string> = {
    pricing: "Pricing",
    privacy: "Privacy",
    security: "Security",
    contact: "Contact",
  };
  return titles[section];
}
