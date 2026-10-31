import { features, type FeatureRegistry } from "@/core/features";
import { credentialToolsFeature } from "./credential-tools/register";
import { dockerFeature } from "./docker/register";
import { fileManagerFeature } from "./file-manager/register";
import { hostDefaultsFeature } from "./host-defaults/register";
import { hostTransferFeature } from "./host-transfer/register";
import { hostMetricsFeature } from "./host-metrics/register";
import { pluginHostFieldsFeature } from "./plugin-host-fields/register";
import {
  rdpFeature,
  remoteDesktopFeature,
  telnetFeature,
  vncFeature,
} from "./remote-desktop/register";
import { servicesFeature } from "./services/register";
import { snippetsFeature } from "./snippets/register";
import { sessionSharingFeature } from "./session-sharing/register";
import { tailscaleFeature } from "./tailscale/register";
import { terminalFeature } from "./terminal/register";
import { totpFeature } from "./totp/register";
import { tunnelsFeature } from "./tunnels/register";
import { wakeOnLanFeature } from "./wake-on-lan/register";

export const BUILT_IN_FEATURES = [
  terminalFeature,
  fileManagerFeature,
  dockerFeature,
  servicesFeature,
  tunnelsFeature,
  hostMetricsFeature,
  remoteDesktopFeature,
  rdpFeature,
  vncFeature,
  telnetFeature,
  wakeOnLanFeature,
  snippetsFeature,
  hostDefaultsFeature,
  hostTransferFeature,
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
  registry.register(pluginHostFieldsFeature(registry));
}
