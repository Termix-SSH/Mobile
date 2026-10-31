/**
 * TermixPipe - native byte pipes from the SSH engine to the terminal view, so pty output never
 * crosses the JS bridge. It has no JS API; this only says whether the build has it.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

export const isPipeAvailable =
  requireOptionalNativeModule<{ ready?: boolean }>("TermixPipe")?.ready ===
  true;
