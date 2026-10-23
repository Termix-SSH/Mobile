import {
  buildResult,
  parseAutoRun,
  parseEngine,
  resultLine,
} from "@/screens/dev/terminal-lab/autoRun";

test("parses a full auto run", () => {
  expect(
    parseAutoRun({
      auto: "1",
      engine: "native",
      scenario: "log",
      seconds: "15",
      rate: "2",
    }),
  ).toEqual({ engine: "native", scenario: "log", seconds: 15, rate: 2 });
});

test("defaults and limits", () => {
  expect(parseAutoRun({ auto: "1", engine: "xterm", scenario: "yes" })).toEqual(
    { engine: "xterm", scenario: "yes", seconds: 20, rate: 0 },
  );
  expect(
    parseAutoRun({
      auto: "1",
      engine: "xterm",
      scenario: "yes",
      seconds: "9999",
      rate: "-1",
    }),
  ).toMatchObject({ seconds: 300, rate: 0 });
});

test("not an auto run", () => {
  expect(parseAutoRun({ engine: "xterm", scenario: "yes" })).toBeNull();
  expect(
    parseAutoRun({ auto: "1", engine: "vt100", scenario: "yes" }),
  ).toBeNull();
  expect(
    parseAutoRun({ auto: "1", engine: "xterm", scenario: "top" }),
  ).toBeNull();
});

test("engine from params, arrays included", () => {
  expect(parseEngine(["ghostty", "xterm"])).toBe("ghostty");
  expect(parseEngine(undefined)).toBeNull();
});

test("result record and line", () => {
  const result = buildResult({
    run: { engine: "ghostty", scenario: "yes", seconds: 2, rate: 0 },
    platform: "android",
    refreshHz: 60,
    intervalsMs: [16.7, 16.7, 40],
    frameTotalsMs: [5, 7],
    engine: { renderedFrames: 3, renderMsP50: 2.04, renderMsP95: 3.96 },
    bytes: 4 * 1024 * 1024,
    elapsedMs: 2000,
    memStartMb: 100.4,
    memPeakMb: 140.6,
  });
  expect(result).toMatchObject({
    engine: "ghostty",
    platform: "android",
    uiDropped: 1,
    uiMax: 40,
    drawnFrames: 2,
    engineFrames: 3,
    engineP50: 2,
    engineP95: 4,
    mbps: 2,
    memStartMb: 100,
    memPeakMb: 141,
  });
  expect(resultLine({ a: 1 })).toBe('TXRESULT {"a":1}');
});

test("engine stats are optional", () => {
  const result = buildResult({
    run: { engine: "xterm", scenario: "idle", seconds: 1, rate: 0 },
    platform: "ios",
    refreshHz: 120,
    intervalsMs: [],
    frameTotalsMs: [],
    engine: null,
    bytes: 0,
    elapsedMs: 1000,
    memStartMb: 1,
    memPeakMb: 1,
  });
  expect(result.engineP50).toBeUndefined();
  expect(result.uiFps).toBe(0);
});
