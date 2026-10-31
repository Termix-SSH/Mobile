import { Asset } from "expo-asset";
import { readLocalText } from "@/utils/localFile";

let cached: string | null = null;

/**
 * Reads the bundled guacamole-common-js source. Bundling it locally keeps
 * remote desktop working on air-gapped and LAN-only networks, where fetching
 * the library from a CDN would fail.
 */
export async function loadGuacamoleAssets(): Promise<string> {
  if (cached) return cached;

  const [asset] = await Asset.loadAsync([
    require("../../../assets/guacamole/guacamole-common.js.html"),
  ]);
  const uri = asset.localUri ?? asset.uri;
  cached = await readLocalText(uri);
  return cached;
}
