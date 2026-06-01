import { Asset } from "expo-asset";

type XtermAssets = {
  xtermJs: string;
  xtermCss: string;
  fitAddonJs: string;
};

let cached: XtermAssets | null = null;

async function readAsset(asset: Asset): Promise<string> {
  const uri = asset.localUri ?? asset.uri;
  const response = await fetch(uri);
  return response.text();
}

export async function loadXtermAssets(): Promise<XtermAssets> {
  if (cached) return cached;

  const [xtermJsAsset, xtermCssAsset, fitAddonAsset] = await Asset.loadAsync([
    require("../../../../assets/xterm/xterm.js.html"),
    require("../../../../assets/xterm/xterm.css.html"),
    require("../../../../assets/xterm/xterm-addon-fit.js.html"),
  ]);

  const [xtermJs, xtermCss, fitAddonJs] = await Promise.all([
    readAsset(xtermJsAsset),
    readAsset(xtermCssAsset),
    readAsset(fitAddonAsset),
  ]);

  cached = { xtermJs, xtermCss, fitAddonJs };
  return cached;
}
