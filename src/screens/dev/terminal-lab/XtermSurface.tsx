// Candidate C: xterm.js in a WebView, the engine 1.x and 2.0 ship today.
// Kept small: the production Terminal.tsx adds its own selection and IME
// layers, but rendering and parsing are the same xterm build.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Clipboard from "expo-clipboard";

import { loadXtermAssets } from "@/features/terminal/loadXtermAssets";
import type {
  EngineStats,
  SurfaceTheme,
  TerminalSurfaceHandle,
  TerminalSurfaceProps,
} from "./surface";

type Assets = Awaited<ReturnType<typeof loadXtermAssets>>;

const ANSI_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

export function xtermTheme(theme: SurfaceTheme): Record<string, string> {
  const out: Record<string, string> = {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    selectionBackground: theme.selectionBackground,
  };
  theme.palette.forEach((c, i) => {
    out[ANSI_KEYS[i]] = c;
  });
  return out;
}

export function xtermHtml(
  assets: Assets,
  theme: SurfaceTheme,
  fontSize: number,
): string {
  const font = assets.nerdFontBase64
    ? `@font-face{font-family:"CaskaydiaCove NFM";src:url("data:font/ttf;base64,${assets.nerdFontBase64}") format("truetype");}`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>${assets.xtermCss}</style><script>${assets.xtermJs}</script><script>${assets.fitAddonJs}</script>
<style>${font}html,body{margin:0;height:100%;background:${theme.background};overflow:hidden}#t{height:100%}</style>
</head><body><div id="t"></div><script>
const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
const term = new Terminal({
  fontFamily: '"CaskaydiaCove NFM", monospace',
  fontSize: ${fontSize},
  scrollback: 10000,
  allowProposedApi: true,
  theme: ${JSON.stringify(xtermTheme(theme))},
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById("t"));
let frames = 0, bytes = 0;
term.onRender(() => { frames++; });
term.onData((d) => post({ t: "input", d: btoa(unescape(encodeURIComponent(d))) }));
term.onBinary((d) => post({ t: "input", d: btoa(d) }));
term.onBell(() => post({ t: "bell" }));
term.onTitleChange((title) => post({ t: "title", title }));
function resize() {
  fit.fit();
  post({ t: "resize", cols: term.cols, rows: term.rows });
}
window.addEventListener("resize", resize);
resize();
window.lab = {
  write(b64) {
    const s = atob(b64);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    bytes += u.length;
    term.write(u);
  },
  paste(text) { term.paste(text); },
  bottom() { term.scrollToBottom(); },
  copy() { post({ t: "copy", text: term.getSelection() }); },
  focus() { term.focus(); },
  blur() { term.blur(); },
  font(size) { term.options.fontSize = size; resize(); },
  stats(id) { post({ t: "stats", id, s: { renderedFrames: frames, bytesParsed: bytes } }); },
};
</script></body></html>`;
}

export const XtermSurface = forwardRef<
  TerminalSurfaceHandle,
  TerminalSurfaceProps
>(function XtermSurface(props, ref) {
  const web = useRef<WebView>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const statsWaiters = useRef(new Map<number, (s: EngineStats) => void>());
  const nextId = useRef(0);
  const ready = useRef(false);
  const pending = useRef<string[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    loadXtermAssets(true).then(setAssets, () => setAssets(null));
  }, []);

  // Font changes go through JS so the page keeps its buffer.
  const initialFont = useRef(props.fontSize);
  useEffect(() => {
    if (ready.current) {
      web.current?.injectJavaScript(`window.lab.font(${props.fontSize});true;`);
    }
  }, [props.fontSize]);

  const html = useMemo(
    () => (assets ? xtermHtml(assets, props.theme, initialFont.current) : null),
    [assets, props.theme],
  );

  const run = (js: string) => {
    if (ready.current) web.current?.injectJavaScript(`${js};true;`);
    else pending.current.push(js);
  };

  useImperativeHandle(ref, () => ({
    write: (b64) => run(`window.lab.write(${JSON.stringify(b64)})`),
    paste: (text) => run(`window.lab.paste(${JSON.stringify(text)})`),
    scrollToBottom: () => run("window.lab.bottom()"),
    copySelection: () => run("window.lab.copy()"),
    focus: () => run("window.lab.focus()"),
    blur: () => run("window.lab.blur()"),
    getStats: () =>
      new Promise<EngineStats | null>((resolve) => {
        if (!ready.current) return resolve(null);
        const id = nextId.current++;
        statsWaiters.current.set(id, resolve);
        web.current?.injectJavaScript(`window.lab.stats(${id});true;`);
        setTimeout(() => {
          if (statsWaiters.current.delete(id)) resolve(null);
        }, 2000);
      }),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const p = propsRef.current;
    switch (msg.t) {
      case "input":
        p.onInput(msg.d as string);
        break;
      case "resize":
        if (!ready.current) {
          ready.current = true;
          for (const js of pending.current.splice(0)) {
            web.current?.injectJavaScript(`${js};true;`);
          }
        }
        p.onResize(msg.cols as number, msg.rows as number);
        break;
      case "copy":
        if (msg.text) Clipboard.setStringAsync(msg.text as string);
        break;
      case "bell":
        p.onBell?.();
        break;
      case "title":
        p.onTitle?.(msg.title as string);
        break;
      case "stats": {
        const done = statsWaiters.current.get(msg.id as number);
        statsWaiters.current.delete(msg.id as number);
        done?.(msg.s as EngineStats);
        break;
      }
    }
  };

  if (!html) return <View style={props.style} />;
  return (
    <WebView
      ref={web}
      style={[props.style, { backgroundColor: props.theme.background }]}
      source={{ html }}
      originWhitelist={["*"]}
      onMessage={onMessage}
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      scrollEnabled={false}
      overScrollMode="never"
    />
  );
});
