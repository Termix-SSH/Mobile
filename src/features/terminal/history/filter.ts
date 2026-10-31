/** Commands that contain every word of the query, any case. */
export function filterHistory(commands: string[], query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const lower = c.toLowerCase();
    return words.every((w) => lower.includes(w));
  });
}
