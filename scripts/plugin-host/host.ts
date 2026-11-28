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
import { startPluginFrame } from "@termix-ssh/plugin-sdk/frame-host";
import coreCss from "@termix-ssh/plugin-sdk/frame-host.css";

import {
  PAGE_RECEIVER,
  PART_VIEW,
  PROBE_VIEW,
  type AppMessage,
  type FrameBoot,
  type FrameFold,
  type PageMessage,
  type ShellCall,
} from "../../src/core/plugins/frame-protocol";
import { createNet } from "./net";
import { installImportMap, isLinkError } from "./shared";
import { watchGestures } from "./gestures";
import { applyFold } from "./fold";
import { createReceiver } from "./receive";

type Win = typeof window & {
  __termixFrameBoot?: FrameBoot;
  ReactNativeWebView?: { postMessage(data: string): void };
  [PAGE_RECEIVER]?: (message: AppMessage) => void;
  /** Where the screen folds across the page, or null. See fold.ts. */
  termixFold?: FrameFold | null;
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

  // Calls for other plugins' parts wait for the app's reply.
  const waiting = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let nextCall = 1;
  const foreign = data.foreign
    ? {
        call: (method: string, args: unknown[]) =>
          new Promise<unknown>((resolve, reject) => {
            const id = `c${nextCall++}`;
            waiting.set(id, { resolve, reject });
            post({ t: "foreign.call", id, method, args: plain(args) });
          }),
        emit: (name: string, value: unknown) =>
          post({ t: "foreign.emit", name, data: plain(value) }),
      }
    : undefined;
  const receiver = createReceiver({
    net: (message) => net.receive(message),
    foreignReply: (reply) => {
      const entry = waiting.get(reply.id);
      waiting.delete(reply.id);
      if (reply.ok) entry?.resolve(reply.value);
      else entry?.reject(new Error("Refused"));
    },
    fold: (fold) => applyFold(fold),
    themeCss: (css) => style("termix-theme", css),
    back: () => post({ t: "back.result", handled: goBack() }),
    parts: (reqId, items) =>
      post({ t: "foreign.parts", reqId, items: plain(items) }),
  });
  win[PAGE_RECEIVER] = receiver.handle;
  win.termixFold = null;

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
  let frame: Awaited<ReturnType<typeof startPluginFrame>>;
  try {
    frame = await startPluginFrame({
      root,
      summary: data.summary as never,
      module,
      view: data.view,
      theme: data.theme,
      locales: data.locales,
      foreign,
      onPartSize: (size) => post({ t: "part.size", ...size }),
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
  const special = data.view.view === PROBE_VIEW || data.view.view === PART_VIEW;
  if (!special && ![...views.tabs, ...views.panels].includes(data.view.view)) {
    post({
      t: "failed",
      reason: "view",
      message: `Nothing registered "${data.view.view}"`,
    });
    return;
  }
  post({ t: "loaded", ...views });

  receiver.start(frame);

  const current = frame;
  watchGestures({
    onRefresh: () => void current.reload(),
    onLink: (url) => post({ t: "link", url }),
    origin: location.origin,
  });
}

/** Plain JSON for a message: functions and other things that can't cross drop out. */
function plain<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as T;
  } catch {
    return null as T;
  }
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
