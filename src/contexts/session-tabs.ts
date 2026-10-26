/** What a tab shows: a name the user gave it, else the shell's title when asked for, else its own. */
export function displayTitle(session: {
  title: string;
  customTitle?: string | null;
  shellTitle?: string | null;
}): string {
  return (
    session.customTitle?.trim() || session.shellTitle?.trim() || session.title
  );
}

/** Moves one tab to a new place; out of range moves are ignored. */
export function moveTab<T extends { id: string }>(
  tabs: T[],
  id: string,
  to: number,
): T[] {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return tabs;
  const target = Math.max(0, Math.min(to, tabs.length - 1));
  if (target === from) return tabs;
  const next = [...tabs];
  const [tab] = next.splice(from, 1);
  next.splice(target, 0, tab);
  return next;
}

/** The tab next to the active one, wrapping around, for swipes and shortcuts. */
export function neighborTab<T extends { id: string }>(
  tabs: T[],
  activeId: string | null,
  step: 1 | -1,
): T | null {
  if (tabs.length < 2) return null;
  const at = tabs.findIndex((t) => t.id === activeId);
  const next = (Math.max(0, at) + step + tabs.length) % tabs.length;
  return tabs[next];
}

/** The tab number of a "tab3" keyboard shortcut, or null. */
export function tabNumber(id: string): number | null {
  const match = /^tab([1-9])$/.exec(id);
  return match ? Number(match[1]) : null;
}

/** The tab that should be active: the current one when it is still open, else the flagged or last one. */
export function pickActiveTab<T extends { id: string; isActive?: boolean }>(
  tabs: T[],
  activeId: string | null,
): string | null {
  if (!tabs.length) return null;
  if (activeId && tabs.some((t) => t.id === activeId)) return activeId;
  return (tabs.find((t) => t.isActive) ?? tabs[tabs.length - 1]).id;
}
