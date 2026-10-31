import type { FeatureIcon } from "@/core/features/types";

export type PaletteSection = "hosts" | "snippets" | "actions" | "settings";

export const SECTION_TITLES: Record<PaletteSection, string> = {
  hosts: "Hosts",
  snippets: "Snippets",
  actions: "Actions",
  settings: "Settings",
};

const ORDER: PaletteSection[] = ["hosts", "snippets", "actions", "settings"];

export interface PaletteItem {
  id: string;
  section: PaletteSection;
  label: string;
  detail?: string;
  /** Other words it is found by, like an address or tags. */
  keywords?: string[];
  icon?: FeatureIcon;
  /** Shown before anything is typed. */
  suggested?: boolean;
  run: () => void;
}

const WORD_BREAK = /[\s\-_.@/:]+/;

/** Lower is better, null means no match. */
export function scoreItem(item: PaletteItem, query: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return item.suggested ? 0 : null;
  const label = item.label.toLowerCase();
  const rest = [item.detail ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (label.startsWith(token)) continue;
    if (label.split(WORD_BREAK).some((w) => w.startsWith(token))) score += 1;
    else if (label.includes(token)) score += 2;
    else if (rest.includes(token)) score += 3;
    else return null;
  }
  return score;
}

/** Matching items by section, best first, at most `perSection` each. */
export function rankPalette(
  items: PaletteItem[],
  query: string,
  perSection = 8,
): { section: PaletteSection; items: PaletteItem[] }[] {
  const scored: { item: PaletteItem; index: number; score: number }[] = [];
  items.forEach((item, index) => {
    const score = scoreItem(item, query);
    if (score !== null) scored.push({ item, index, score });
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return ORDER.map((section) => ({
    section,
    items: scored
      .filter((s) => s.item.section === section)
      .slice(0, perSection)
      .map((s) => s.item),
  })).filter((group) => group.items.length > 0);
}
