import { isKnownFeature } from "./events";
import { recordFeature } from "./usage";

/**
 * A session tab was opened. Only tab types of built in features are counted,
 * so a plugin or community name never becomes a key.
 */
export function trackTabOpened(type: string): void {
  if (!isKnownFeature(type)) return;
  void recordFeature(type).catch(() => {});
}
