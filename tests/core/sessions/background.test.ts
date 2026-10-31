import { BackgroundSessions, serviceContent } from "@/core/sessions/background";
import { SessionStatusStore } from "@/core/sessions/status";
import { plainStore } from "@/core/storage/kv";

const flush = () => new Promise((r) => setTimeout(r, 0));

function deps(platform = "android") {
  const status = new SessionStatusStore();
  let watcher: () => void = () => {};
  let disconnectAll: () => void = () => {};
  const lifecycle = {
    isActive: true,
    watch: (l: () => void) => {
      watcher = l;
      return () => {};
    },
  };
  let running = false;
  const service = {
    show: jest.fn(() => {
      running = true;
      return true;
    }),
    hide: jest.fn(() => {
      running = false;
    }),
    isRunning: () => running,
    beginGrace: jest.fn(),
    endGrace: jest.fn(),
    onDisconnectAll: (cb: () => void) => {
      disconnectAll = cb;
      return () => {};
    },
  };
  const askNotifications = jest.fn(async () => {});
  return {
    d: {
      platform,
      available: true,
      lifecycle,
      status,
      service,
      askNotifications,
    },
    status,
    lifecycle,
    service,
    askNotifications,
    fireWatch: () => watcher(),
    fireDisconnectAll: () => disconnectAll(),
  };
}

test("the notification lists open sessions with their state", () => {
  const content = serviceContent(
    [
      { id: "a", title: "web1" },
      { id: "b", title: "db2" },
      { id: "c", title: "gone" },
    ],
    {
      a: { state: "connected" },
      b: { state: "reconnecting" },
      c: { state: "failed" },
    },
  );
  expect(content).toEqual({
    title: "2 sessions open",
    lines: ["web1 | Connected", "db2 | Reconnecting"],
    actionLabel: "Disconnect all",
    channelName: "Sessions",
  });
  expect(serviceContent([{ id: "a", title: "x" }], {})).toBeNull();
  expect(
    serviceContent([{ id: "a", title: "x" }], { a: { state: "offline" } })
      ?.title,
  ).toBe("1 session open");
});

test("Android runs the service while sessions are open and stops after", async () => {
  const t = deps();
  const bg = new BackgroundSessions();
  const onDisconnectAll = jest.fn();
  bg.start(onDisconnectAll, t.d as any);
  bg.setTabs([{ id: "a", title: "web1" }]);
  expect(t.service.show).not.toHaveBeenCalled();

  t.status.set("a", { state: "connected" });
  expect(t.service.show).toHaveBeenCalledTimes(1);
  expect(t.askNotifications).toHaveBeenCalledTimes(1);
  // Same content: no update.
  bg.sync();
  expect(t.service.show).toHaveBeenCalledTimes(1);
  t.status.set("a", { state: "reconnecting" });
  expect(t.service.show).toHaveBeenCalledTimes(2);
  expect(t.askNotifications).toHaveBeenCalledTimes(1);

  t.fireDisconnectAll();
  expect(onDisconnectAll).toHaveBeenCalled();

  t.status.set("a", { state: "closed" });
  expect(t.service.hide).toHaveBeenCalled();
  bg.stop();
});

test("Android can't start the service from the background, only update it", () => {
  const t = deps();
  const bg = new BackgroundSessions();
  bg.start(() => {}, t.d as any);
  bg.setTabs([{ id: "a", title: "web1" }]);
  t.lifecycle.isActive = false;
  t.status.set("a", { state: "connected" });
  expect(t.service.show).not.toHaveBeenCalled();
  t.lifecycle.isActive = true;
  t.fireWatch();
  expect(t.service.show).toHaveBeenCalledTimes(1);
  t.lifecycle.isActive = false;
  t.status.set("a", { state: "reconnecting" });
  expect(t.service.show).toHaveBeenCalledTimes(2);
  bg.stop();
});

test("turning it off stops the service and is saved", async () => {
  const t = deps();
  const bg = new BackgroundSessions();
  bg.start(() => {}, t.d as any);
  bg.setTabs([{ id: "a", title: "web1" }]);
  t.status.set("a", { state: "connected" });
  await bg.setEnabled(false);
  expect(bg.isEnabled).toBe(false);
  expect(t.service.hide).toHaveBeenCalled();
  expect(await plainStore.get("sessions.keepInBackground")).toBe("0");

  const again = new BackgroundSessions();
  const t2 = deps();
  again.start(() => {}, t2.d as any);
  again.setTabs([{ id: "a", title: "web1" }]);
  t2.status.set("a", { state: "connected" });
  await flush();
  expect(again.isEnabled).toBe(false);
  await again.setEnabled(true);
  expect(t2.service.show).toHaveBeenCalled();
  bg.stop();
  again.stop();
});

test("iOS asks for the finishing time when leaving with sessions open, and nothing more", () => {
  const t = deps("ios");
  const bg = new BackgroundSessions();
  bg.start(() => {}, t.d as any);
  bg.setTabs([{ id: "a", title: "web1" }]);
  t.status.set("a", { state: "connected" });
  expect(t.service.show).not.toHaveBeenCalled();
  t.lifecycle.isActive = false;
  t.fireWatch();
  t.fireWatch();
  expect(t.service.beginGrace).toHaveBeenCalledTimes(1);
  t.lifecycle.isActive = true;
  t.fireWatch();
  expect(t.service.endGrace).toHaveBeenCalledTimes(1);
  bg.stop();
});

test("tunnels alone keep the notification", () => {
  expect(serviceContent([], {}, ["box | Connected"])).toMatchObject({
    title: "1 tunnel active",
    lines: ["box | Connected"],
  });
  expect(serviceContent([], {}, [])).toBeNull();
});
