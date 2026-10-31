import {
  isLive,
  SessionStatusStore,
  statusFromConnection,
} from "@/core/sessions/status";

test("connection states map to tab states", () => {
  expect(statusFromConnection({ status: "idle" })).toEqual({
    state: "idle",
  });
  expect(
    statusFromConnection({
      status: "prompt",
      origin: "local",
      prompt: { kind: "passphrase" },
    }),
  ).toEqual({ state: "connecting" });
  expect(
    statusFromConnection({
      status: "connected",
      origin: "relay",
      hasData: true,
    }),
  ).toEqual({ state: "connected" });
  expect(
    statusFromConnection({
      status: "reconnecting",
      origin: "local",
      attempt: 2,
      nextAt: null,
      reason: "gone",
    }),
  ).toEqual({ state: "reconnecting", reason: "gone" });
  expect(
    statusFromConnection({ status: "offline", origin: "local", reason: "x" }),
  ).toEqual({ state: "offline", reason: "x" });
  expect(
    statusFromConnection({
      status: "failed",
      failure: { stage: "auth", message: "no", hint: "h" },
    }),
  ).toEqual({ state: "failed", reason: "no" });
  expect(statusFromConnection({ status: "closed" })).toEqual({
    state: "closed",
  });
});

test("only open connections count as live", () => {
  expect(
    ["connecting", "connected", "reconnecting", "offline"].every((s) =>
      isLive(s as any),
    ),
  ).toBe(true);
  expect(isLive("idle")).toBe(false);
  expect(isLive("failed")).toBe(false);
  expect(isLive("closed")).toBe(false);
});

test("the store tells listeners only about real changes and forgets closed tabs", () => {
  const store = new SessionStatusStore();
  const listener = jest.fn();
  const stop = store.subscribe(listener);
  store.set("a", { state: "connected" });
  store.set("a", { state: "connected" });
  expect(listener).toHaveBeenCalledTimes(1);
  store.set("b", { state: "reconnecting", reason: "x" });
  expect(store.get("b")).toEqual({ state: "reconnecting", reason: "x" });
  const before = store.getSnapshot();
  store.retain(["a", "b"]);
  expect(store.getSnapshot()).toBe(before);
  store.retain(["a"]);
  expect(Object.keys(store.getSnapshot())).toEqual(["a"]);
  store.remove("a");
  store.remove("a");
  expect(store.getSnapshot()).toEqual({});
  expect(listener).toHaveBeenCalledTimes(4);
  stop();
  store.set("c", { state: "connected" });
  expect(listener).toHaveBeenCalledTimes(4);
});
