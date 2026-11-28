import type {
  AppMessage,
  FrameFold,
  FrameTheme,
  FrameViewTarget,
} from "../../src/core/plugins/frame-protocol";

type Describe = Extract<AppMessage, { t: "foreign.describe" }>;

/** The part of the SDK's plugin frame that app messages reach. */
export interface ReceivingFrame {
  setTheme(theme: FrameTheme): void;
  setView(view: FrameViewTarget): void;
  reload(): unknown;
  foreignEvent(name: string, data: unknown): void;
  describeParts(kind: Describe["kind"], id: string): { items: unknown[] };
}

/**
 * Routes the app's messages inside the page. Network answers, replies to
 * calls for other plugins' parts and the fold are handled at once; the rest
 * wait until the plugin is up.
 */
export function createReceiver(options: {
  /** True when the message was a network answer. */
  net: (message: AppMessage) => boolean;
  foreignReply: (reply: Extract<AppMessage, { t: "foreign.reply" }>) => void;
  fold: (fold: FrameFold | null) => void;
  themeCss: (css: string) => void;
  back: () => void;
  parts: (reqId: string, items: unknown[]) => void;
}) {
  let frame: ReceivingFrame | null = null;
  let backlog: AppMessage[] = [];
  const handle = (message: AppMessage) => {
    if (options.net(message)) return;
    if (message.t === "foreign.reply") {
      options.foreignReply(message);
      return;
    }
    // Layout only, so it needs no plugin yet.
    if (message.t === "fold") {
      options.fold(message.fold);
      return;
    }
    if (!frame) {
      backlog.push(message);
      return;
    }
    if (message.t === "theme") {
      options.themeCss(message.css);
      frame.setTheme(message.theme);
    } else if (message.t === "view") {
      frame.setView(message.view);
    } else if (message.t === "reload") {
      void frame.reload();
    } else if (message.t === "back") {
      options.back();
    } else if (message.t === "foreign.event") {
      frame.foreignEvent(message.name, message.data);
    } else if (message.t === "foreign.describe") {
      const { items } = frame.describeParts(message.kind, message.id);
      options.parts(message.reqId, items);
    }
  };
  return {
    handle,
    /** The plugin is up: handles what waited, then everything as it comes. */
    start(next: ReceivingFrame) {
      frame = next;
      const queued = backlog;
      backlog = [];
      queued.forEach(handle);
    },
  };
}
