import type { ComponentType, Ref, RefObject } from "react";
import type { Account } from "@/core/accounts/types";
import type { AccountClient } from "@/core/api/AccountClient";
import type { ConnectionOrigin } from "@/core/transport/origin";
import type {
  TransportCapability,
  TransportKind,
} from "@/core/transport/types";
import type { SSHHost, SSHHostData } from "@/types";

/**
 * Everything the UI can show for a feature comes from here. Screens list
 * contributions; they never check a feature or plugin id themselves.
 */

/** Where a feature comes from: built into the app, or a server plugin UI. */
export type FeatureSource = "native" | "webview";

/** What a feature needs from the server. Matched against the plugin list. */
export interface FeatureRequirement {
  plugin: string;
  protocol?: string;
  /** Pre 2.9 servers don't have it built in. */
  pluginApiOnly?: boolean;
}

export interface FeatureContext {
  account: Account;
  /** Null on This device. */
  client: AccountClient | null;
}

/** Light icon type so features can use any lucide icon. */
export type FeatureIcon = ComponentType<{ size?: number; color?: string }>;

// Session tabs

/** The part of an open session a tab needs. */
export interface SessionLike {
  id: string;
  type: string;
  title: string;
  host: SSHHost;
  instanceId: string;
  restoredSessionId?: string | null;
  remoteProtocol?: string;
  /** Overrides the host's saved origin for this tab. */
  origin?: ConnectionOrigin;
  /** Brought back after the app was closed; its first connect is a resume. */
  restored?: boolean;
  /** What the tab saved to pick up where it was, like a tmux session name. */
  resumeData?: Record<string, string> | null;
  /** The tab this one was opened from as a companion, like a terminal. */
  linkedSessionId?: string | null;
}

/** How a tab's connection is doing, shown in the tab bar and the notification. */
export interface SessionTabStatus {
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "offline"
    | "failed"
    | "closed";
  reason?: string;
}

export interface SessionTabProps {
  session: SessionLike;
  isVisible: boolean;
  onClose: () => void;
  /** Reports the server session id so other devices can attach to it. */
  onBackendSessionId: (backendId: string | null) => void;
  /** Reports which way the tab's connection went (relay tabs are listed for other devices). */
  onTransportResolved?: (kind: TransportKind) => void;
  /** Lets the shell read the tab's background color. */
  onBackgroundColorChange?: (color: string) => void;
  /** A title the program set, when the host shows those. Null clears it. */
  onTitle?: (title: string | null) => void;
  /** Opens the tab's menu, like tapping the active tab. */
  onMenu?: () => void;
  /** A hardware keyboard shortcut the tab leaves to the session screen. */
  onShortcut?: (id: string) => void;
  /** Reports the connection status for the tab bar and the notification. */
  onStatus?: (status: SessionTabStatus) => void;
  /** Saves data the tab needs to pick up again after the app was closed. */
  onResumeData?: (data: Record<string, string> | null) => void;
}

/**
 * Things the session screen does for some tabs.
 * - `terminal-input`: the tab takes typed input through a TerminalHandle ref,
 *   so the keyboard bar, custom keyboard and IME input show for it.
 * - `own-keyboard`: the tab shows the system keyboard itself and the tab bar
 *   hides while it is open.
 * - `keyboard-cover`: the custom keyboard area is covered while this tab shows.
 */
export type SessionCapability =
  "terminal-input" | "own-keyboard" | "keyboard-cover";

export interface SessionTabDef {
  /** Session type stored on the tab. */
  type: string;
  icon: FeatureIcon;
  /** Word added to the tab title, empty for none. */
  titleSuffix: (session: Pick<SessionLike, "remoteProtocol">) => string;
  /** Short label in the connections list. */
  shortLabel: (session: Pick<SessionLike, "remoteProtocol">) => string;
  /** tabType names the web app uses for this tab (open-tabs). */
  serverTabTypes: string[];
  toServerTabType: (
    session: Pick<SessionLike, "remoteProtocol">,
    client: AccountClient | null,
  ) => string;
  /** Options to reopen a server tab record of one of `serverTabTypes`. */
  fromServerTabType?: (tabType: string) => { remoteProtocol?: string };
  /** What the server needs for this tab, per session. */
  requires?: (
    session: Pick<SessionLike, "remoteProtocol">,
  ) => FeatureRequirement;
  capabilities?: SessionCapability[];
  /**
   * What the tab needs from the way a host connects. A host whose origin
   * can't do it shows a message instead of opening.
   */
  needs?: TransportCapability[];
  /** Like `needs`, but any one of the lists will do. Wins over `needs`. */
  needsOneOf?: TransportCapability[][];
  /** What the server needs to run this tab through it. Ways through the server drop out without it. */
  relayRequires?: FeatureRequirement;
  /** The phone opens this protocol itself, so hosts without SSH can still connect from the phone. */
  dialsDirectly?: boolean;
  // Each tab has its own handle type, so the ref stays loose here.
  component: ComponentType<SessionTabProps & { ref?: Ref<any> }>;
  /** The key row and keys panel of a `terminal-input` tab. */
  inputChrome?: {
    keyRow: ComponentType<SessionKeyRowProps>;
    keyPanel: ComponentType<SessionKeyPanelProps>;
  };
}

/** The key row above the keyboard, as the session screen places it. */
export interface SessionKeyRowProps {
  terminalRef: RefObject<TerminalInputHandle | null>;
  host?: SSHHost | null;
  isVisible: boolean;
  isKeyboardIntentionallyHidden?: boolean;
  bottomInset?: number;
  /** Key row commands the screen handles, like opening a panel tab. */
  onCommand?: (id: string) => void;
}

/** The keys panel that stands in for the keyboard. */
export interface SessionKeyPanelProps {
  terminalRef: RefObject<TerminalInputHandle | null>;
  isVisible: boolean;
  keyboardHeight: number;
  isKeyboardIntentionallyHidden?: boolean;
  initialTab?: string;
  hostId?: number;
  host?: SSHHost;
  onCommand?: (id: string) => void;
  /** Height of the panel's tab strip, the key row's height so the tab bar never moves. */
  barHeight?: number;
}

// Hosts

export interface HostActionContext extends FeatureContext {
  openSession: (
    type: string,
    opts?: { remoteProtocol?: string },
  ) => void | Promise<void>;
  close: () => void;
}

export interface HostActionDef {
  id: string;
  label: string;
  icon: FeatureIcon;
  /** "connect" rows sit above "manage" rows. */
  group: "connect" | "manage";
  order: number;
  isAvailable: (host: SSHHost, ctx: FeatureContext) => boolean;
  run: (host: SSHHost, ctx: HostActionContext) => void | Promise<void>;
}

/**
 * A host switch in the host editor (Protocols or Features list). Its key is
 * a boolean field on the host, like enableDocker.
 */
export interface HostToggleDef {
  key: string;
  label: string;
  description?: string;
  group: "protocol" | "feature";
  order: number;
  /** What a new host starts with. Off when unset. */
  defaultOn?: boolean;
}

/** The values a host editor section works on. */
export type HostFormValues = Record<string, unknown>;

/** What a section can know about the rest of the editor. */
export interface HostEditorContext {
  isEdit: boolean;
  /** The account's other hosts, for pickers. */
  otherHosts: SSHHost[];
  /** Current value of every host switch, by key. */
  toggles: Record<string, boolean>;
}

export interface HostFormTabProps {
  host: SSHHost | null;
  value: HostFormValues;
  onChange: (patch: HostFormValues) => void;
  context: HostEditorContext;
}

export interface HostFormEditor {
  /** Gets the host with its secrets when editing. */
  read: (host: SSHHost | null) => HostFormValues;
  /** Puts the section's values on the payload the form saves. */
  write: (value: HostFormValues, payload: SSHHostData) => void;
  component: ComponentType<HostFormTabProps>;
  /** A message when the values can't be saved, checked on Save. */
  validate?: (value: HostFormValues) => string | null;
}

/**
 * A section of the host editor a feature draws. "host" sections sit with the
 * name and address, "ssh" ones under SSH (shown while SSH is on), "protocol"
 * ones after SSH and "feature" ones at the end.
 */
export interface HostEditorSectionDef {
  id: string;
  label: string;
  icon?: FeatureIcon;
  group: "host" | "ssh" | "protocol" | "feature";
  order: number;
  /** Shown only while this host switch is on. */
  toggle?: string;
  editor: HostFormEditor;
}

/** A short tag on host rows, like DKR. */
export interface HostBadgeDef {
  label: string;
  order: number;
  show: (host: SSHHost, sshActive: boolean) => boolean;
}

/** An option in the host list filter. Values are saved, so keep them stable. */
export interface HostFilterDef {
  group: "protocol" | "features";
  value: string;
  label: string;
  order: number;
  matches: (host: SSHHost) => boolean;
}

// Settings and quick actions

/** The groups Settings is built from. */
export type SettingsSectionId =
  | "accounts"
  | "appearance"
  | "terminal"
  | "keyboard"
  | "security"
  | "notifications"
  | "privacy"
  | "plugins"
  | "backup"
  | "about";

export interface SettingsLinkDef {
  id: string;
  label: string;
  icon: FeatureIcon;
  order: number;
  /** Route to open. */
  href: string;
  /** Where it sits in Settings. Accounts when left out. */
  section?: SettingsSectionId;
  /** One line under the label. */
  description?: string;
  /** Extra words the Settings search matches. */
  keywords?: string[];
}

/**
 * A row on the Tools tab. With `tabType` it asks for a host and opens that
 * tab on it; with `href` it opens a screen.
 */
export interface ToolDef {
  id: string;
  label: string;
  description?: string;
  icon: FeatureIcon;
  order: number;
  tabType?: string;
  /** Hosts the picker lists. Unset means every host. */
  isAvailable?: (host: SSHHost) => boolean;
  href?: string;
}

export interface QuickActionDef {
  id: string;
  label: string;
  icon: FeatureIcon;
  order: number;
  run: (ctx: FeatureContext) => void;
}

/** Sticky key row modifier: armed for the next key, or locked until tapped again. */
export type StickyModifierState = "inactive" | "armed" | "locked";

/**
 * A terminal that reads the keyboard itself. The key row sends named keys and text through it so
 * its sticky Ctrl and Alt apply, and the app shows or hides the keyboard on it.
 */
export interface TerminalKeyTarget {
  focus: () => void;
  blur: () => void;
  sendKey: (name: string, shift?: boolean) => void;
  typeText: (text: string) => void;
  paste: (text: string) => void;
  toggleModifier: (name: "ctrl" | "alt") => void;
  modifiers: () => { ctrl: StickyModifierState; alt: StickyModifierState };
  subscribeModifiers: (listener: () => void) => () => void;
}

/** What a `terminal-input` tab exposes through its ref. */
export interface TerminalInputHandle {
  sendInput: (data: string) => void;
  fit: () => void;
  isDialogOpen: () => boolean;
  notifyBackgrounded: () => void;
  notifyForegrounded: () => void;
  scrollToBottom: () => void;
  isSelecting: () => boolean;
  /** Set when the tab draws a native terminal that owns the keyboard. */
  keyTarget?: () => TerminalKeyTarget | null;
  /** Runs a key row command the tab knows, like "search". False when it doesn't. */
  command?: (id: string) => boolean;
  /** The shell's working directory, or null when it can't tell. */
  getCwd?: () => Promise<string | null>;
}

// Companions

/** What a companion panel gets: the tab it sits beside and that tab's handle. */
export interface CompanionProps {
  session: SessionLike & { accountId: string };
  getHandle: () => TerminalInputHandle | null;
  isVisible: boolean;
  /** "side" beside the tab on a tablet, "tab" as its own tab on a phone. */
  layout: "side" | "tab";
  close: () => void;
}

/** A panel shown beside a tab on tablets, or opened as a linked tab on phones. */
export interface CompanionDef {
  id: string;
  title: string;
  icon: FeatureIcon;
  order: number;
  /** Session tab types it can sit beside. */
  forTabTypes: string[];
  isAvailable: (host: SSHHost) => boolean;
  component: ComponentType<CompanionProps>;
  /** On phones it opens as a tab of this type, linked to the tab it came from. */
  phoneTabType?: string;
  /** Where it sits and how wide on a tablet, and whether it opens with new tabs. */
  layout?: () => { side: "left" | "right"; size: number; autoOpen: boolean };
  /** The user dragged the panel edge to this width. */
  onResize?: (size: number) => void;
}

export interface KeyboardTabProps {
  terminalRef: RefObject<TerminalInputHandle | null>;
  hostId?: number;
  /** The active tab's host, for snippet variables. */
  host?: SSHHost;
  isVisible: boolean;
  height: number;
}

/** A tab in the terminal keyboard toolbar. */
export interface KeyboardTabDef {
  id: string;
  label: string;
  order: number;
  component: ComponentType<KeyboardTabProps>;
}

/** What a tab menu item gets: the tab, its handle and how it connects. */
export interface SessionMenuContext extends FeatureContext {
  session: SessionLike & {
    accountId: string;
    backendSessionId?: string | null;
  };
  /** The tab's ref handle; a TerminalInputHandle for terminal-input tabs. */
  handle: TerminalInputHandle | null;
  /** "relay" when the tab goes through the server. */
  transport?: TransportKind | null;
}

/** An item in a session tab's menu (tap the active tab). */
export interface SessionMenuItemDef {
  id: string;
  label: string;
  icon: FeatureIcon;
  order: number;
  isAvailable: (ctx: SessionMenuContext) => boolean;
  /** Runs when picked. */
  run?: (ctx: SessionMenuContext) => void;
  /** Or a view shown over the session until it closes. */
  view?: ComponentType<{ ctx: SessionMenuContext; onClose: () => void }>;
}

export interface DashboardCardProps {
  host: SSHHost;
  /** Account the host belongs to. */
  accountId: string | null;
  /** False while Home is hidden or the app is away; cards stop polling. */
  active: boolean;
}

/** A small live card for a pinned host on Home. */
export interface DashboardCardDef {
  id: string;
  title: string;
  order: number;
  /** The session tab type it stands for, so it connects the way that tab would. */
  tabType: string;
  isAvailable: (host: SSHHost) => boolean;
  component: ComponentType<DashboardCardProps>;
}

export interface FeatureDef {
  id: string;
  title: string;
  source: FeatureSource;
  /** Server plugin behind a webview feature. */
  pluginId?: string;
  /**
   * Server plugins this feature stands in for, so Settings can say what each
   * plugin does in the app.
   */
  plugins?: string[];
  /** Needed on linked servers. Unset means always there. */
  requires?: FeatureRequirement;
  /** Which accounts can use it. Defaults to linked servers only. */
  availableOn?: ("local" | "server")[];
  sessionTabs?: SessionTabDef[];
  hostActions?: HostActionDef[];
  hostToggles?: HostToggleDef[];
  /** A list, or a function for sections that depend on the account. */
  hostEditorSections?:
    HostEditorSectionDef[] | ((ctx: FeatureContext) => HostEditorSectionDef[]);
  hostBadges?: HostBadgeDef[];
  hostFilters?: HostFilterDef[];
  settingsLinks?: SettingsLinkDef[];
  quickActions?: QuickActionDef[];
  tools?: ToolDef[];
  keyboardTabs?: KeyboardTabDef[];
  sessionMenuItems?: SessionMenuItemDef[];
  companions?: CompanionDef[];
  dashboardCards?: DashboardCardDef[];
  /**
   * Named things in the app's own vocabulary that this feature fills, for
   * small spots like a form field. See CAPABILITIES.
   */
  capabilities?: Capability[];
}

/**
 * Capability names screens may ask about. They describe a spot in the UI,
 * not a plugin, so a different feature can fill one later.
 */
export type Capability =
  | "host.quickConnect"
  | "hosts.discovery"
  | "credentials.keyTools"
  | "widgets.snippets";
