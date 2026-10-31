import type { SettingsGroup, SettingsItemDef } from "./types";

export interface SettingsHit {
  item: SettingsItemDef;
  sectionTitle: string;
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ");
}

/** 0 means no match. Every word of the query has to match somewhere. */
function score(item: SettingsItemDef, sectionTitle: string, words: string[]) {
  const label = norm(item.label);
  const rest = norm(
    [item.description ?? "", ...(item.keywords ?? [])].join(" "),
  );
  const section = norm(sectionTitle);
  let total = 0;
  for (const w of words) {
    if (label.startsWith(w) || label.includes(` ${w}`)) total += 4;
    else if (label.includes(w)) total += 3;
    else if (rest.includes(w)) total += 2;
    else if (section.includes(w)) total += 1;
    else return 0;
  }
  return total;
}

/** Items that match the query, best first. An empty query matches nothing. */
export function searchSettings(
  groups: SettingsGroup[],
  query: string,
): SettingsHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (SettingsHit & { score: number; at: number })[] = [];
  let at = 0;
  for (const group of groups) {
    for (const item of group.items) {
      const s = score(item, group.section.title, words);
      if (s > 0) {
        hits.push({
          item,
          sectionTitle: group.section.title,
          score: s,
          at: at++,
        });
      }
    }
  }
  return hits
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map(({ item, sectionTitle }) => ({ item, sectionTitle }));
}
