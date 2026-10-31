import {
  MAX_AUTO_RECONNECTS,
  RESUME_WINDOW_MS,
  shouldAutoReconnect,
  tunnelWatchScript,
} from "@/features/remote-desktop/resume";

test("a stale tunnel after coming back always reconnects, a few times at most", () => {
  expect(
    shouldAutoReconnect({
      reason: "stale",
      attempts: 0,
      away: false,
      sinceResumeMs: 60_000,
    }),
  ).toBe(true);
  expect(
    shouldAutoReconnect({
      reason: "stale",
      attempts: MAX_AUTO_RECONNECTS,
      away: false,
      sinceResumeMs: 0,
    }),
  ).toBe(false);
});

test("a closed tunnel reconnects only around a trip away, so a logoff still ends it", () => {
  const lost = (away: boolean, sinceResumeMs: number) =>
    shouldAutoReconnect({ reason: "lost", attempts: 0, away, sinceResumeMs });
  expect(lost(true, 999_999)).toBe(true);
  expect(lost(false, RESUME_WINDOW_MS - 1)).toBe(true);
  expect(lost(false, RESUME_WINDOW_MS + 1)).toBe(false);
});

test("the page script keeps the client's tunnel handlers and adds the alive check", () => {
  const script = tunnelWatchScript(5000);
  expect(script).toContain("clientInstruction.call(tunnel, opcode, args)");
  expect(script).toContain("clientTunnelState.call(tunnel, state)");
  expect(script).toContain("post({ type: 'lost' })");
  expect(script).toContain("window.termixAlive = function");
  expect(script).toContain("}, 5000);");
});

test("the alive check reports a dead tunnel", () => {
  jest.useFakeTimers();
  const posts: unknown[] = [];
  const tunnel: any = {
    state: 1,
    oninstruction: jest.fn(),
    onstatechange: jest.fn(),
  };
  const win: any = {};
  const Guacamole = { Tunnel: { State: { OPEN: 1, CLOSED: 2 } } };
  const run = new Function(
    "tunnel",
    "post",
    "window",
    "Guacamole",
    tunnelWatchScript(8000),
  );
  run(tunnel, (p: unknown) => posts.push(p), win, Guacamole);

  // An instruction after the check started: alive.
  win.termixAlive();
  tunnel.oninstruction("nop", []);
  jest.advanceTimersByTime(8000);
  expect(posts).toEqual([]);

  // Nothing at all: stale.
  win.termixAlive();
  jest.advanceTimersByTime(8000);
  expect(posts).toEqual([{ type: "stale" }]);

  // A closed tunnel is reported at once, after the client's own handler.
  tunnel.onstatechange(2);
  expect(posts).toEqual([{ type: "stale" }, { type: "lost" }]);
  tunnel.state = 2;
  win.termixAlive();
  expect(posts.at(-1)).toEqual({ type: "stale" });
  jest.useRealTimers();
});
