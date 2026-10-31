import {
  LOG_LIMIT,
  clearLogs,
  formatLogs,
  getLogs,
  pushLog,
} from "@/core/log/buffer";
import { createLogger } from "@/core/log/logger";

beforeEach(clearLogs);

describe("log buffer", () => {
  it("keeps only the newest lines", () => {
    for (let i = 0; i < LOG_LIMIT + 20; i++) pushLog("info", `line ${i}`, i);
    const lines = getLogs();
    expect(lines).toHaveLength(LOG_LIMIT);
    expect(lines[0].text).toBe("line 20");
    expect(lines.at(-1)!.text).toBe(`line ${LOG_LIMIT + 19}`);
  });

  it("cuts very long lines", () => {
    pushLog("info", "x".repeat(5000));
    expect(getLogs()[0].text.length).toBeLessThan(1100);
  });

  it("formats oldest first with a time and level", () => {
    pushLog("info", "a", Date.UTC(2026, 0, 1));
    pushLog("error", "b", Date.UTC(2026, 0, 2));
    expect(formatLogs().split("\n")).toEqual([
      "2026-01-01T00:00:00.000Z INFO a",
      "2026-01-02T00:00:00.000Z ERROR b",
    ]);
  });

  it("collects what the app logs", () => {
    createLogger("TEST").info("hello", { operation: "x" });
    createLogger("TEST").error("bad", new Error("boom"), { operation: "y" });
    const text = formatLogs();
    expect(text).toContain("hello");
    expect(text).toContain("boom");
  });
});
