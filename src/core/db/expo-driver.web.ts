import type { DbDriver } from "./driver";

// SQLCipher has no web build. The web export is for screenshots only.
export const expoDriver: DbDriver | null = null;
