import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

type XtermAssets = {
  xtermJs: string;
  xtermCss: string;
  fitAddonJs: string;
  nerdFontBase64: string;
};

let cached: XtermAssets | null = null;

async function readAsset(asset: Asset): Promise<string> {
  const uri = asset.localUri ?? asset.uri;
  const response = await fetch(uri);
  return response.text();
}

export async function loadXtermAssets(): Promise<XtermAssets> {
  if (cached) return cached;

  const [xtermJsAsset, xtermCssAsset, fitAddonAsset, nerdFontAsset] =
    await Asset.loadAsync([
      require("../../../../assets/xterm/xterm.js.html"),
      require("../../../../assets/xterm/xterm.css.html"),
      require("../../../../assets/xterm/xterm-addon-fit.js.html"),
      require("../../../../assets/fonts/CaskaydiaCoveNerdFontMono-Regular.ttf"),
    ]);

  const [xtermJs, xtermCss, fitAddonJs, nerdFontBase64] = await Promise.all([
    readAsset(xtermJsAsset),
    readAsset(xtermCssAsset),
    readAsset(fitAddonAsset),
    FileSystem.readAsStringAsync(nerdFontAsset.localUri ?? nerdFontAsset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    }),
  ]);

  cached = { xtermJs, xtermCss, fitAddonJs, nerdFontBase64 };
  return cached;
}
