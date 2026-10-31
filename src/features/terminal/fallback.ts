import { isTerminalEngineAvailable } from "@/modules/termix-terminal";

/**
 * The xterm terminal in a web view, used where the native engine is missing
 * (Expo Go, web, 32 bit Android).
 */
export function shouldUseXterm(engine = isTerminalEngineAvailable): boolean {
  return !engine;
}

export const XTERM_FALLBACK = shouldUseXterm();
