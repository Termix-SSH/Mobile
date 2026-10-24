import { features, type FeatureRegistry } from "@/core/features";
import { aiFeature } from "./ai/register";
import { credentialToolsFeature } from "./credential-tools/register";
import { dockerFeature } from "./docker/register";
import { fileManagerFeature } from "./file-manager/register";
import { hostMetricsFeature } from "./host-metrics/register";
import {
  rdpFeature,
  remoteDesktopFeature,
  telnetFeature,
  vncFeature,
} from "./remote-desktop/register";
import { snippetsFeature } from "./snippets/register";
import { sessionSharingFeature } from "./session-sharing/register";
import { tailscaleFeature } from "./tailscale/register";
import { terminalFeature } from "./terminal/register";
import { totpFeature } from "./totp/register";
import { tunnelsFeature } from "./tunnels/register";
import { wakeOnLanFeature } from "./wake-on-lan/register";

export const BUILT_IN_FEATURES = [
  aiFeature,
  terminalFeature,
  fileManagerFeature,
  dockerFeature,
  tunnelsFeature,
  hostMetricsFeature,
  remoteDesktopFeature,
  rdpFeature,
  vncFeature,
  telnetFeature,
  wakeOnLanFeature,
  snippetsFeature,
  totpFeature,
  tailscaleFeature,
  credentialToolsFeature,
  sessionSharingFeature,
];

let registered = false;

/** Adds the features built into the app. Runs once at start. */
export function registerBuiltInFeatures(
  registry: FeatureRegistry = features,
): void {
  if (registry === features) {
    if (registered) return;
    registered = true;
  }
  for (const def of BUILT_IN_FEATURES) registry.register(def);
}
