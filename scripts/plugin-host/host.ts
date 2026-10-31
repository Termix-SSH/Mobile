// The page a plugin runs in, inside the app's web view. The app writes the
// boot data into the HTML, then talks to the page through messages.

import * as React from "react";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as JsxRuntime from "react/jsx-runtime";
import * as I18next from "i18next";
import * as ReactI18next from "react-i18next";
import * as Sonner from "sonner";
import * as SdkFrontend from "@termix-ssh/plugin-sdk/frontend";
import * as SdkUi from "@termix-ssh/plugin-sdk/ui";
// SDK 1.0.22 adds these; the build points at a core checkout until it is on npm.
/* eslint-disable import/no-unresolved */
import {
  startPluginFrame,
  type PluginFrame,
} from "@termix-ssh/plugin-sdk/frame-host";
import coreCss from "@termix-ssh/plugin-sdk/frame-host.css";
/* eslint-enable import/no-unresolved */
import {
  PAGE_RECEIVER,
  type AppMessage,
  type FrameBoot,
  type PageMessage,
  type ShellCall,
} from "../../src/core/plugins/frame-protocol";
import { createNet } from "./net";
import { installImportMap, isLinkError } from "./shared";
import { watchGestures } from "./gestures";

type Win = typeof window & {
  __termixFrameBoot?: FrameBoot;
  ReactNativeWebView?: { postMessage(data: string): void };
  [PAGE_RECEIVER]?: (message: AppMessage) => void;
};

const win = window as Win;

function post(message: PageMessage) {
  win.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function style(id: string, css: string) {
  let node = document.getElementById(id) as HTMLStyleElement | null;
  if (!node) {
    node = document.createElement("style");
    node.id = id;
    document.head.appendChild(node);
  }
  node.textContent = css;
}

function blobUrl(source: string) {
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

async function boot() {
  const data = win.__termixFrameBoot;
  if (!data) return;

  const net = createNet(location.origin, post, window.fetch.bind(window));
  window.fetch = net.fetch;
  win.XMLHttpRequest = net.XMLHttpRequest;
  win.WebSocket = net.WebSocket;

  let frame: PluginFrame | null = null;
  let backlog: AppMessage[] = [];
  const handle = (message: AppMessage) => {
    if (net.receive(message)) return;
    if (!frame) {
      backlog.push(message);
      return;
    }
    if (message.t === "theme") {
      style("termix-theme", message.css);
      frame.setTheme(message.theme);
    } else if (message.t === "view") {
      frame.setView(message.view);
    } else if (message.t === "reload") {
      void frame.reload();
    } else if (message.t === "back") {
      post({ t: "back.result", handled: goBack() });
    }
  };
  win[PAGE_RECEIVER] = handle;

  style("termix-core", coreCss);
  style("termix-theme", data.themeCss);
  if (data.css) style("termix-plugin", data.css);

  installImportMap(
    {
      react: React,
      "react-dom": ReactDom,
      "react-dom/client": ReactDomClient,
      "react/jsx-runtime": JsxRuntime,
      i18next: I18next,
      "react-i18next": ReactI18next,
      sonner: Sonner,
      "@termix-ssh/plugin-sdk/frontend": SdkFrontend,
      "@termix-ssh/plugin-sdk/ui": SdkUi,
    },
    blobUrl,
  );

  let module: { activate: (app: never) => unknown; deactivate?: () => unknown };
  try {
    module = await import(/* @vite-ignore */ blobUrl(data.code));
  } catch (error) {
    post({
      t: "failed",
      reason: isLinkError(error) ? "link" : "activate",
      message: String(error),
    });
    return;
  }

  const shell =
    (call: ShellCall) =>
    (...args: unknown[]) =>
      post({ t: "shell", call, args });
  const root = document.getElementById("root")!;
  try {
    frame = await startPluginFrame({
      root,
      summary: data.summary as never,
      module,
      view: data.view,
      theme: data.theme,
      locales: data.locales,
      shell: {
        openTab: shell("openTab"),
        openSingletonTab: shell("openSingletonTab"),
        connectHost: shell("connectHost"),
        closeTab: shell("closeTab"),
        renameTab: shell("renameTab"),
        openHostEditor: shell("openHostEditor"),
      },
    });
  } catch (error) {
    post({ t: "failed", reason: "activate", message: String(error) });
    return;
  }

  const views = frame.views();
  if (![...views.tabs, ...views.panels].includes(data.view.view)) {
    post({
      t: "failed",
      reason: "view",
      message: `Nothing registered "${data.view.view}"`,
    });
    return;
  }
  post({ t: "loaded", ...views });

  const waiting = backlog;
  backlog = [];
  waiting.forEach(handle);

  const current = frame;
  watchGestures({
    onRefresh: () => void current.reload(),
    onLink: (url) => post({ t: "link", url }),
    origin: location.origin,
  });
}

/** Closes an open dialog or menu, else goes back in the page's own history. */
function goBack(): boolean {
  const open = document.querySelector(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [data-state="open"][data-radix-popper-content-wrapper]',
  );
  if (open) {
    const target =
      (document.activeElement as HTMLElement | null) ?? document.body;
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    return true;
  }
  if (history.state && history.length > 1) {
    history.back();
    return true;
  }
  return false;
}

window.addEventListener("error", (event) =>
  post({ t: "log", level: "error", message: String(event.message) }),
);
window.addEventListener("unhandledrejection", (event) =>
  post({ t: "log", level: "error", message: String(event.reason) }),
);

void boot();
