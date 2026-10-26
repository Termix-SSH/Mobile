import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, View } from "react-native";
import { Asset } from "expo-asset";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { LOCAL_PAGE_ORIGINS, stayOnLocalPage } from "@/utils/webview";
import { useTheme, useUiColors } from "@/contexts/ThemeContext";
import { readLocalText } from "@/utils/localFile";
import { languageFor } from "./language";

let editorScript: Promise<string> | null = null;

function loadEditorScript() {
  if (!editorScript) {
    editorScript = (async () => {
      const [asset] = await Asset.loadAsync([
        require("../../../../assets/editor/editor.js.html"),
      ]);
      return readLocalText(asset.localUri ?? asset.uri);
    })();
    editorScript.catch(() => {
      editorScript = null;
    });
  }
  return editorScript;
}

const page = (script: string, background: string) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>html,body,#editor{margin:0;height:100%;background:${background}}</style>
</head><body><div id="editor"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

export interface EditorHandle {
  /** The text as it is in the editor now. */
  getText: () => Promise<string>;
  markSaved: () => void;
  openSearch: () => void;
}

/** CodeMirror in a WebView with no network, themed like the app. */
export const EditorView = forwardRef<
  EditorHandle,
  {
    text: string;
    name: string;
    path: string;
    readOnly?: boolean;
    fontSize: number;
    wrap: boolean;
    onDirty: (dirty: boolean) => void;
    onSave: () => void;
  }
>(({ text, name, path, readOnly, fontSize, wrap, onDirty, onSave }, ref) => {
  const colors = useUiColors();
  const { isDark } = useTheme();
  const web = useRef<WebView>(null);
  const [script, setScript] = useState<string | null>(null);
  const waiting = useRef<((text: string) => void)[]>([]);
  const ready = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadEditorScript().then((s) => alive && setScript(s));
    return () => {
      alive = false;
    };
  }, []);

  const send = (message: Record<string, unknown>) =>
    web.current?.injectJavaScript(
      `window.termixEditor && window.termixEditor(${JSON.stringify(message)}); true;`,
    );

  useEffect(() => {
    if (ready.current) send({ type: "setFontSize", fontSize });
  }, [fontSize]);

  useEffect(() => {
    if (ready.current) send({ type: "setWrap", wrap });
  }, [wrap]);

  useImperativeHandle(ref, () => ({
    getText: () =>
      new Promise((resolve) => {
        waiting.current.push(resolve);
        send({ type: "getText" });
      }),
    markSaved: () => send({ type: "markSaved" }),
    openSearch: () => send({ type: "search" }),
  }));

  const onMessage = (event: WebViewMessageEvent) => {
    let message: { type?: string; dirty?: boolean; text?: string };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === "ready") {
      ready.current = true;
      send({
        type: "load",
        text,
        language: languageFor(name, path),
        readOnly: !!readOnly,
        fontSize,
        wrap,
        theme: {
          background: colors.background,
          foreground: colors.text,
          muted: colors.textMuted,
          border: colors.border,
          accent: colors.brand,
          selection: colors.active,
          gutter: colors.surface,
          dark: isDark,
        },
      });
    } else if (message.type === "change") {
      onDirty(!!message.dirty);
    } else if (message.type === "text") {
      const resolve = waiting.current.shift();
      resolve?.(message.text ?? "");
    } else if (message.type === "save") {
      onSave();
    }
  };

  if (!script) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <WebView
      ref={web}
      originWhitelist={LOCAL_PAGE_ORIGINS}
      source={{ html: page(script, colors.background) }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      allowFileAccess={false}
      allowsLinkPreview={false}
      setSupportMultipleWindows={false}
      hideKeyboardAccessoryView
      keyboardDisplayRequiresUserAction={false}
      onShouldStartLoadWithRequest={stayOnLocalPage}
      style={{ flex: 1, backgroundColor: colors.background }}
    />
  );
});
EditorView.displayName = "EditorView";
