/**
 * Other plugins' parts inside a plugin web view. The page lists them and
 * draws placeholders; the app asks each plugin that may have parts (a probe
 * web view that only runs activate), then draws each part in its own web
 * view over its placeholder, clipped to the page. The page never gets a
 * handle on another plugin's web view.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import { View } from "react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import type { ServerPlugin } from "@/core/api/compat/server-features";
import { apiFit } from "@/core/plugins/compat";
import {
  MAX_LISTS,
  MAX_VIEWS,
  mayPlaceForeign,
  mergeParts,
  partKeys,
  placePart,
  providersFor,
  readRect,
  splitPartKey,
  validId,
  isForeignKind,
  type ForeignKind,
  type PartPlacement,
  type Rect,
} from "@/core/plugins/foreign";
import {
  PART_VIEW,
  PROBE_VIEW,
  type AppMessage,
  type FrameViewTarget,
  type PageMessage,
  type ShellCall,
} from "@/core/plugins/frame-protocol";
import type { FramePlugin } from "@/core/plugins/webview";

export interface PartWebViewHandle {
  describe: (kind: ForeignKind, id: string) => Promise<unknown[]>;
}

/** The web view the parts use: PluginWebView, passed in to avoid a cycle. */
export type PartWebView = ComponentType<{
  ref?: Ref<PartWebViewHandle>;
  client: AccountClient;
  plugin: FramePlugin;
  view: FrameViewTarget;
  onShell: (call: ShellCall, args: unknown[]) => void;
  mode: "probe" | "part";
  onReady?: () => void;
  onPartSize?: (size: { width: number; height: number }) => void;
}>;

interface ListState {
  kind: ForeignKind;
  id: string;
  keys: Set<string>;
}

interface ViewState {
  id: string;
  listId: string;
  key: string;
  kind: ForeignKind;
  pointId: string;
  props: Record<string, unknown>;
  placement: PartPlacement;
}

/** A plugin's web frontend as a part source, whatever the app shows of it. */
export function partPlugin(plugin: ServerPlugin): FramePlugin | null {
  if (!plugin.frame) return null;
  return {
    id: plugin.id,
    name: plugin.name ?? plugin.id,
    icon: plugin.frame.icon,
    entry: plugin.mobile?.entry ?? "frontend.js",
    frame: plugin.frame,
    views: [],
    fit: apiFit(plugin.engine?.api, "webview"),
  };
}

function cacheKey(pluginId: string, kind: ForeignKind, id: string) {
  return `${pluginId}\u0000${kind}\u0000${id}`;
}

export function useForeignParts(options: {
  client: AccountClient;
  consumerId: string;
  send: (message: AppMessage) => void;
  onShell: (call: ShellCall, args: unknown[]) => void;
  View: PartWebView;
}): {
  handle: (message: PageMessage) => boolean;
  layer: ReactNode;
} {
  const { client, consumerId, send, onShell, View: PartView } = options;
  const lists = useRef(new Map<string, ListState>());
  const views = useRef(new Map<string, ViewState>());
  const [, setVersion] = useState(0);
  const redraw = useCallback(() => setVersion((n) => n + 1), []);
  const [page, setPage] = useState({ width: 0, height: 0 });
  const described = useRef(new Map<string, Promise<unknown[]>>());
  const [probing, setProbing] = useState<string[]>([]);
  const probeWaiters = useRef(
    new Map<string, ((handle: PartWebViewHandle | null) => void)[]>(),
  );
  const probeHandles = useRef(new Map<string, PartWebViewHandle>());
  const sendRef = useRef(send);
  sendRef.current = send;

  const plugins = useMemo(
    () => client.serverPlugins ?? [],
    [client.serverPlugins],
  );
  const consumer = plugins.find((plugin) => plugin.id === consumerId);

  const reply = useCallback((id: string, ok: boolean, value?: unknown) => {
    sendRef.current({ t: "foreign.reply", id, ok, value });
  }, []);
  const event = useCallback((name: string, data: unknown) => {
    sendRef.current({ t: "foreign.event", name, data });
  }, []);

  /** A probe for one plugin, started when first needed. */
  const probe = useCallback((pluginId: string) => {
    const ready = probeHandles.current.get(pluginId);
    if (ready) return Promise.resolve<PartWebViewHandle | null>(ready);
    return new Promise<PartWebViewHandle | null>((resolve) => {
      const waiting = probeWaiters.current.get(pluginId) ?? [];
      waiting.push(resolve);
      probeWaiters.current.set(pluginId, waiting);
      setProbing((list) =>
        list.includes(pluginId) ? list : [...list, pluginId],
      );
      // A probe that never starts answers nothing.
      setTimeout(() => {
        const left = probeWaiters.current.get(pluginId);
        if (!left?.includes(resolve)) return;
        probeWaiters.current.set(
          pluginId,
          left.filter((entry) => entry !== resolve),
        );
        resolve(null);
      }, 20_000);
    });
  }, []);

  const describe = useCallback(
    (plugin: ServerPlugin, kind: ForeignKind, id: string) => {
      const key = cacheKey(plugin.id, kind, id);
      let found = described.current.get(key);
      if (!found) {
        found = probe(plugin.id).then(async (handle) =>
          handle ? handle.describe(kind, id).catch(() => []) : [],
        );
        described.current.set(key, found);
      }
      return found;
    },
    [probe],
  );

  const handle = useCallback(
    (message: PageMessage): boolean => {
      if (message.t === "foreign.call") {
        const { id, method } = message;
        const args = Array.isArray(message.args) ? message.args : [];
        if (method === "foreign.list") {
          const [listId, kind, pointId] = args;
          if (
            !validId(listId) ||
            !isForeignKind(kind) ||
            typeof pointId !== "string" ||
            !mayPlaceForeign(consumerId, consumer, kind, pointId) ||
            (!lists.current.has(listId) && lists.current.size >= MAX_LISTS)
          ) {
            reply(id, true, false);
            return true;
          }
          lists.current.set(listId, { kind, id: pointId, keys: new Set() });
          reply(id, true, true);
          const providers = providersFor(plugins, consumerId, pointId);
          void Promise.all(
            providers.map(async (plugin) => ({
              pluginId: plugin.id,
              items: await describe(plugin, kind, pointId),
            })),
          ).then((all) => {
            const list = lists.current.get(listId);
            if (!list) return;
            const items = mergeParts(kind, all);
            list.keys = partKeys(items);
            event("foreign.items", { listId, items, strings: {} });
          });
          return true;
        }
        if (method === "foreign.unlist") {
          const [listId] = args;
          if (typeof listId === "string" && lists.current.delete(listId)) {
            for (const [viewId, view] of views.current) {
              if (view.listId === listId) views.current.delete(viewId);
            }
            redraw();
          }
          reply(id, true);
          return true;
        }
        if (method === "foreign.mount") {
          const data = (args[0] ?? {}) as Record<string, unknown>;
          const list =
            typeof data.listId === "string"
              ? lists.current.get(data.listId)
              : undefined;
          const ok =
            validId(data.id) &&
            !!list &&
            typeof data.itemKey === "string" &&
            list.keys.has(data.itemKey) &&
            !!splitPartKey(data.itemKey);
          if (!ok) {
            reply(id, true, false);
            return true;
          }
          const existing = views.current.get(data.id as string);
          if (
            (!existing && views.current.size >= MAX_VIEWS) ||
            (existing && existing.key !== data.itemKey)
          ) {
            reply(id, true, false);
            return true;
          }
          views.current.set(data.id as string, {
            id: data.id as string,
            listId: data.listId as string,
            key: data.itemKey as string,
            kind: list!.kind,
            pointId: list!.id,
            props:
              data.props && typeof data.props === "object"
                ? (data.props as Record<string, unknown>)
                : {},
            placement: existing?.placement ?? {
              rect: { x: 0, y: 0, width: 0, height: 0 },
              clip: null,
              visible: false,
              covers: [],
            },
          });
          redraw();
          reply(id, true, true);
          return true;
        }
        if (method === "foreign.focus") {
          reply(id, true);
          return true;
        }
        // Other plugins' actions don't run in the app.
        reply(id, false);
        return true;
      }
      if (message.t === "foreign.emit") {
        const data = (message.data ?? {}) as Record<string, unknown>;
        if (message.name === "foreign.place" && Array.isArray(data.views)) {
          for (const raw of data.views as unknown[]) {
            const entry = (raw ?? {}) as Record<string, unknown>;
            const view =
              typeof entry.id === "string"
                ? views.current.get(entry.id)
                : undefined;
            const rect = readRect(entry.rect);
            if (!view || !rect) continue;
            view.placement = {
              rect,
              clip: entry.clip === null ? null : readRect(entry.clip),
              visible: entry.visible === true,
              covers: Array.isArray(entry.covers)
                ? entry.covers
                    .slice(0, 20)
                    .map(readRect)
                    .filter((cover): cover is Rect => !!cover)
                : [],
            };
          }
          redraw();
        } else if (message.name === "foreign.props") {
          const view =
            typeof data.id === "string"
              ? views.current.get(data.id)
              : undefined;
          if (view) {
            views.current.set(view.id, {
              ...view,
              props:
                data.props && typeof data.props === "object"
                  ? (data.props as Record<string, unknown>)
                  : {},
            });
            redraw();
          }
        } else if (message.name === "foreign.dispose") {
          if (typeof data.id === "string" && views.current.delete(data.id)) {
            redraw();
          }
        }
        return true;
      }
      return false;
    },
    [consumer, consumerId, describe, event, plugins, redraw, reply],
  );

  // Lists and probes go with the page.
  useEffect(() => {
    const ownLists = lists.current;
    const cache = described.current;
    const ownViews = views.current;
    return () => {
      ownLists.clear();
      cache.clear();
      ownViews.clear();
    };
  }, []);

  const pluginsById = useMemo(
    () => new Map(plugins.map((plugin) => [plugin.id, plugin])),
    [plugins],
  );

  const layer = (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
      onLayout={(e) =>
        setPage({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      {probing.map((pluginId) => {
        const source = pluginsById.get(pluginId);
        const plugin = source ? partPlugin(source) : null;
        if (!plugin) return null;
        return (
          <View
            key={`probe:${pluginId}`}
            pointerEvents="none"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          >
            <PartView
              ref={(next: PartWebViewHandle | null) => {
                if (next) probeHandles.current.set(pluginId, next);
                else probeHandles.current.delete(pluginId);
              }}
              client={client}
              plugin={plugin}
              view={{ view: PROBE_VIEW }}
              mode="probe"
              onShell={() => {}}
              onReady={() => {
                const ready = probeHandles.current.get(pluginId) ?? null;
                const waiting = probeWaiters.current.get(pluginId) ?? [];
                probeWaiters.current.delete(pluginId);
                waiting.forEach((resolve) => resolve(ready));
              }}
            />
          </View>
        );
      })}
      {[...views.current.values()].map((view) => {
        const split = splitPartKey(view.key);
        const source = split ? pluginsById.get(split.pluginId) : undefined;
        const plugin = source ? partPlugin(source) : null;
        if (!split || !plugin) return null;
        const out = placePart(page, view.placement);
        const { rect, shown } = out;
        return (
          <View
            key={view.id}
            pointerEvents={out.hidden ? "none" : "box-none"}
            style={{
              position: "absolute",
              left: shown.x,
              top: shown.y,
              width: Math.max(shown.width, 1),
              height: Math.max(shown.height, 1),
              overflow: "hidden",
              opacity: out.hidden ? 0 : 1,
            }}
          >
            <View
              style={{
                position: "absolute",
                left: rect.x - shown.x,
                top: rect.y - shown.y,
                width: Math.max(rect.width, 1),
                height: Math.max(rect.height, 1),
              }}
            >
              <PartView
                client={client}
                plugin={plugin}
                view={{
                  view: PART_VIEW,
                  data: {
                    kind: view.kind,
                    id: view.pointId,
                    itemKey: split.itemKey,
                    props: view.props,
                  },
                }}
                mode="part"
                onShell={onShell}
                onPartSize={(size) =>
                  event("foreign.size", { id: view.id, size })
                }
              />
            </View>
          </View>
        );
      })}
    </View>
  );

  return { handle, layer };
}
