import {
  isRetryable,
  MAX_RECONNECT_TRIES,
  reconnectDelay,
} from "@/core/transport/reconnect";

describe("reconnectDelay", () => {
  const mid = () => 0.5;

  test("first try is right away, then it backs off to 30s", () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 10].map((n) =>
      reconnectDelay(n, { random: mid }),
    );
    expect(delays).toEqual([0, 1000, 2000, 4000, 8000, 15000, 30000, 30000]);
  });

  test("low power doubles the wait up to a minute", () => {
    expect(reconnectDelay(1, { lowPower: true, random: mid })).toBe(0);
    expect(reconnectDelay(2, { lowPower: true, random: mid })).toBe(2000);
    expect(reconnectDelay(7, { lowPower: true, random: mid })).toBe(60000);
  });

  test("jitter stays within 20 percent", () => {
    expect(reconnectDelay(4, { random: () => 0 })).toBe(3200);
    expect(reconnectDelay(4, { random: () => 1 })).toBe(4800);
    expect(reconnectDelay(0, { random: mid })).toBe(0);
  });

  test("there is a last try", () => {
    expect(MAX_RECONNECT_TRIES).toBe(10);
  });
});

describe("isRetryable", () => {
  const f = (stage: any, message = "x", extra = {}) => ({
    stage,
    message,
    hint: "h",
    ...extra,
  });

  test("network and dropped sessions are retried", () => {
    expect(isRetryable(f("network"))).toBe(true);
    expect(isRetryable(f("session"))).toBe(true);
  });

  test("logins, host keys, cancels and taken over sessions are not", () => {
    for (const stage of [
      "auth",
      "hostKey",
      "cancelled",
      "unavailable",
      "proxy",
    ])
      expect(isRetryable(f(stage))).toBe(false);
    expect(isRetryable(f("session", "x", { noRetry: true }))).toBe(false);
  });

  test("a server that is down is retried, a signed out one is not", () => {
    expect(isRetryable(f("server", "server not responding"))).toBe(true);
    expect(
      isRetryable({
        stage: "server",
        message: "Signed out of this server. Log in again.",
        hint: "Sign in to this server again.",
      }),
    ).toBe(false);
  });
});
