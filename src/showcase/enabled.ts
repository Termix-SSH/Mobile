/**
 * Store screenshot builds only (`EXPO_PUBLIC_SHOWCASE=1`): fake hosts and
 * connections with no network. Inlined at build time.
 */
export const SHOWCASE = process.env.EXPO_PUBLIC_SHOWCASE === "1";
