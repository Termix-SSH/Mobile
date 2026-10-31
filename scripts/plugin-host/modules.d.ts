// Types for what the page bundles but the app itself never imports.

declare module "react-dom";
declare module "react-dom/client";

declare module "@termix-ssh/plugin-sdk/frame-host.css" {
  const css: string;
  export default css;
}

// Matches core's src/ui/plugin-host/frame-host.tsx (SDK 1.0.22).
declare module "@termix-ssh/plugin-sdk/frame-host" {
  export interface FrameTheme {
    id: string;
    mode: "light" | "dark";
  }
  export interface FrameView {
    view: string;
    hostId?: string;
    data?: Record<string, unknown>;
  }
  export interface FrameShell {
    openTab: (...args: unknown[]) => void;
    openSingletonTab: (...args: unknown[]) => void;
    connectHost: (...args: unknown[]) => void;
    closeTab: (...args: unknown[]) => void;
    renameTab: (...args: unknown[]) => void;
    openHostEditor?: (...args: unknown[]) => void;
  }
  export interface PluginFrame {
    views: () => { tabs: string[]; panels: string[] };
    setView: (view: FrameView) => void;
    setTheme: (theme: FrameTheme) => void;
    reload: () => Promise<void>;
    dispose: () => Promise<void>;
  }
  export function startPluginFrame(options: {
    root: HTMLElement;
    summary: never;
    module: { activate: (app: never) => unknown; deactivate?: () => unknown };
    view: FrameView;
    theme: FrameTheme;
    shell: FrameShell;
    locales?: {
      language?: string;
      en?: Record<string, unknown>;
      translated?: Record<string, unknown>;
    };
    guest?: boolean;
  }): Promise<PluginFrame>;
}
