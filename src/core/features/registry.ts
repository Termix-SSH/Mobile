import type { TransportCapability } from "@/core/transport/types";
import type { SSHHost } from "@/types";
import type {
  Capability,
  CompanionDef,
  DashboardCardDef,
  FeatureContext,
  FeatureDef,
  FeatureRequirement,
  SessionCapability,
  SessionMenuContext,
  SessionTabDef,
} from "./types";

/** Whether the account's server (or This device) can use this requirement. */
export function meets(
  req: FeatureRequirement | undefined,
  ctx: FeatureContext,
): boolean {
  if (!req) return true;
  if (!ctx.client) return false;
  return ctx.client.supports(req);
}

export function isFeatureAvailable(
  def: FeatureDef,
  ctx: FeatureContext,
): boolean {
  const on = def.availableOn ?? ["server"];
  if (ctx.account.kind === "local") return on.includes("local");
  if (!on.includes("server")) return false;
  return meets(def.requires, ctx);
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/**
 * Holds every feature the app knows: built in screens register at start, and
 * plugin WebViews from a linked server register when they load.
 */
export class FeatureRegistry {
  private defs = new Map<string, FeatureDef>();
  private listeners = new Set<() => void>();
  private version = 0;

  register(def: FeatureDef): () => void {
    if (this.defs.has(def.id)) {
      throw new Error(`Feature ${def.id} is already registered`);
    }
    this.defs.set(def.id, def);
    this.emit();
    return () => {
      if (this.defs.get(def.id) === def) {
        this.defs.delete(def.id);
        this.emit();
      }
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  all(): FeatureDef[] {
    return [...this.defs.values()];
  }

  /** Features that stand in for a server plugin, on or off. */
  forPlugin(pluginId: string): FeatureDef[] {
    return this.all().filter(
      (def) => def.plugins?.includes(pluginId) || def.pluginId === pluginId,
    );
  }

  available(ctx: FeatureContext): FeatureDef[] {
    return this.all().filter((def) => isFeatureAvailable(def, ctx));
  }

  // Session tabs are looked up even when the feature is off, so an open tab
  // keeps rendering after a plugin is turned off.

  sessionTab(type: string): SessionTabDef | null {
    for (const def of this.defs.values()) {
      const tab = def.sessionTabs?.find((t) => t.type === type);
      if (tab) return tab;
    }
    return null;
  }

  /** The feature that owns a session tab type. */
  sessionFeature(type: string): FeatureDef | null {
    for (const def of this.defs.values()) {
      if (def.sessionTabs?.some((t) => t.type === type)) return def;
    }
    return null;
  }

  /** What tabs of this type need from the host's transport, as lists where any one will do. */
  sessionNeeds(type: string): TransportCapability[][] {
    const tab = this.sessionTab(type);
    if (tab?.needsOneOf?.length) return tab.needsOneOf;
    return [tab?.needs ?? []];
  }

  /** Tabs that only ever run through a server (other devices can list them at once). */
  serverOnly(type: string): boolean {
    return this.sessionNeeds(type).every((group) =>
      group.some((n) => n === "server" || n === "guacd"),
    );
  }

  /** Whether tabs of this type have a session screen capability. */
  sessionHas(type: string | undefined, capability: SessionCapability): boolean {
    if (!type) return false;
    return !!this.sessionTab(type)?.capabilities?.includes(capability);
  }

  /** What a host opens when nothing else is asked for: the shell tab. */
  defaultSessionType(): string {
    for (const def of this.defs.values()) {
      for (const tab of def.sessionTabs ?? []) {
        if (tab.capabilities?.includes("terminal-input")) return tab.type;
      }
    }
    return this.all().flatMap((d) => d.sessionTabs ?? [])[0]?.type ?? "";
  }

  /** The tab for an open-tabs record from the server, with its options. */
  sessionTabForServerType(
    tabType: string,
  ): { tab: SessionTabDef; opts: { remoteProtocol?: string } } | null {
    for (const def of this.defs.values()) {
      for (const tab of def.sessionTabs ?? []) {
        if (tab.serverTabTypes.includes(tabType)) {
          return { tab, opts: tab.fromServerTabType?.(tabType) ?? {} };
        }
      }
    }
    return null;
  }

  /** Whether a tab of this type and options can open on this account. */
  canOpen(
    type: string,
    opts: { remoteProtocol?: string },
    ctx: FeatureContext,
  ): boolean {
    for (const def of this.defs.values()) {
      const tab = def.sessionTabs?.find((t) => t.type === type);
      if (!tab) continue;
      if (!isFeatureAvailable({ ...def, requires: undefined }, ctx)) {
        return false;
      }
      // Requirements name server plugins; This device has none to check.
      if (ctx.account.kind === "local") return true;
      return meets(tab.requires?.(opts) ?? def.requires, ctx);
    }
    return false;
  }

  hostActions(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.hostActions).sort(byOrder);
  }

  hostToggles(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.hostToggles).sort(byOrder);
  }

  hostEditorSections(ctx: FeatureContext) {
    return this.collect(ctx, (d) =>
      typeof d.hostEditorSections === "function"
        ? d.hostEditorSections(ctx)
        : d.hostEditorSections,
    ).sort(byOrder);
  }

  hostBadges(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.hostBadges).sort(byOrder);
  }

  hostFilters(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.hostFilters).sort(byOrder);
  }

  settingsLinks(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.settingsLinks).sort(byOrder);
  }

  quickActions(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.quickActions).sort(byOrder);
  }

  tools(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.tools).sort(byOrder);
  }

  keyboardTabs(ctx: FeatureContext) {
    return this.collect(ctx, (d) => d.keyboardTabs).sort(byOrder);
  }

  sessionMenuItems(ctx: SessionMenuContext) {
    return this.collect(ctx, (d) => d.sessionMenuItems)
      .filter((item) => item.isAvailable(ctx))
      .sort(byOrder);
  }

  /** Panels that can sit beside a tab of this type for this host. */
  companionsFor(
    tabType: string,
    host: SSHHost,
    ctx: FeatureContext,
  ): CompanionDef[] {
    return this.collect(ctx, (d) => d.companions)
      .filter((c) => c.forTabTypes.includes(tabType) && c.isAvailable(host))
      .sort(byOrder);
  }

  hasCapability(capability: Capability, ctx: FeatureContext): boolean {
    return this.available(ctx).some((d) =>
      d.capabilities?.includes(capability),
    );
  }

  /** Cards for one host on Home, in order. */
  dashboardCards(host: SSHHost, ctx: FeatureContext): DashboardCardDef[] {
    return this.collect(ctx, (d) => d.dashboardCards)
      .filter((c) => c.isAvailable(host))
      .sort(byOrder);
  }

  private collect<T>(
    ctx: FeatureContext,
    pick: (def: FeatureDef) => T[] | undefined,
  ): T[] {
    return this.available(ctx).flatMap((def) => pick(def) ?? []);
  }
}

/** The app's registry. Built in features fill it from src/features. */
export const features = new FeatureRegistry();
