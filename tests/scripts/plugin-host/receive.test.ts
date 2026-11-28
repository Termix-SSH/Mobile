import type {
  AppMessage,
  FrameFold,
} from "../../../src/core/plugins/frame-protocol";
import { createReceiver } from "../../../scripts/plugin-host/receive";

const fold: FrameFold = { axis: "vertical", start: 88, end: 112, active: true };

function setup() {
  const seen: string[] = [];
  const folds: (FrameFold | null)[] = [];
  const receiver = createReceiver({
    net: (message) => message.t === "http.end",
    foreignReply: (reply) => seen.push(`reply ${reply.id}`),
    fold: (next) => folds.push(next),
    themeCss: (css) => seen.push(`css ${css}`),
    back: () => seen.push("back"),
    parts: (reqId, items) => seen.push(`parts ${reqId} ${items.length}`),
  });
  const frame = {
    setTheme: (theme: { id: string }) => seen.push(`theme ${theme.id}`),
    setView: (view: { view: string }) => seen.push(`view ${view.view}`),
    reload: () => seen.push("reload"),
    foreignEvent: (name: string) => seen.push(`event ${name}`),
    describeParts: () => ({ items: [1, 2] }),
  };
  return { receiver, frame, seen, folds };
}

test("the fold reaches the page before the plugin is up", () => {
  const { receiver, frame, seen, folds } = setup();
  receiver.handle({ t: "fold", fold });
  expect(folds).toEqual([fold]);

  // Not held back and played a second time.
  receiver.start(frame);
  expect(folds).toEqual([fold]);
  expect(seen).toEqual([]);

  receiver.handle({ t: "fold", fold: null });
  expect(folds).toEqual([fold, null]);
});

test("the rest waits for the plugin, in order", () => {
  const { receiver, frame, seen } = setup();
  receiver.handle({
    t: "theme",
    theme: { id: "dark", mode: "dark" },
    css: "x",
  });
  receiver.handle({ t: "view", view: { view: "alerts" } });
  expect(seen).toEqual([]);

  receiver.start(frame);
  expect(seen).toEqual(["css x", "theme dark", "view alerts"]);

  receiver.handle({ t: "reload" });
  receiver.handle({ t: "back" });
  expect(seen.slice(3)).toEqual(["reload", "back"]);
});

test("other plugins' parts: replies pass at once, the rest waits", () => {
  const { receiver, frame, seen } = setup();
  receiver.handle({ t: "foreign.reply", id: "c1", ok: true });
  receiver.handle({ t: "foreign.event", name: "changed", data: null });
  receiver.handle({
    t: "foreign.describe",
    reqId: "r1",
    kind: "slot",
    id: "host.card",
  });
  expect(seen).toEqual(["reply c1"]);

  receiver.start(frame);
  expect(seen.slice(1)).toEqual(["event changed", "parts r1 2"]);
});

test("network answers never reach the plugin", () => {
  const { receiver, frame, seen, folds } = setup();
  receiver.start(frame);
  receiver.handle({ t: "http.end", id: "1" } as AppMessage);
  expect(seen).toEqual([]);
  expect(folds).toEqual([]);
});
