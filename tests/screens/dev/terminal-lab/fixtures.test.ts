import {
  altScreenFrame,
  describeMouseReport,
  logChunks,
  logLine,
  palette256,
  testPattern,
  truecolorRamp,
  yesChunk,
} from "@/screens/dev/terminal-lab/fixtures";

test("truecolor ramp uses 24 bit backgrounds", () => {
  const ramp = truecolorRamp(4);
  expect(ramp.match(/\x1b\[48;2;\d+;\d+;\d+m/g)).toHaveLength(4);
  expect(ramp.endsWith("\x1b[0m\r\n")).toBe(true);
});

test("256 color table has every index in 16 rows", () => {
  const table = palette256();
  expect(table.match(/\x1b\[48;5;\d+m/g)).toHaveLength(256);
  expect(table.split("\r\n").filter(Boolean)).toHaveLength(16);
});

test("test pattern covers wide text, emoji and nerd glyphs", () => {
  const p = testPattern();
  expect(p).toContain("日本語");
  expect(p).toContain("👩‍💻");
  expect(p).toContain(String.fromCodePoint(0xe0b0));
  expect(p).toContain(String.fromCodePoint(0xf0219));
  expect(p).toContain("\x1b[3mitalic");
});

test("yes chunk is about the asked size", () => {
  expect(yesChunk(1000)).toHaveLength(1000);
  expect(yesChunk(1)).toBe("y\n");
});

test("log lines are deterministic and colored", () => {
  expect(logLine(5)).toBe(logLine(5));
  expect(logLine(0)).toMatch(/\x1b\[32mINFO /);
});

test("log chunks add up to at least the total", () => {
  const chunks = Array.from(logChunks(10_000, 1000));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  expect(total).toBeGreaterThanOrEqual(10_000);
  expect(chunks.every((c) => c.length >= 1000)).toBe(true);
});

test("alt screen frame fills every row", () => {
  const frame = altScreenFrame(40, 10, 1);
  expect(frame).toContain("\x1b[10;1H");
  expect(frame).toContain("tick 1");
});

test("mouse reports read as text", () => {
  expect(describeMouseReport("\x1b[<0;12;5M")).toBe(
    "mouse press button=0 col=12 row=5",
  );
  expect(describeMouseReport("\x1b[<0;12;5m")).toBe(
    "mouse release button=0 col=12 row=5",
  );
  expect(describeMouseReport("\x1b[<64;1;1M")).toBe(
    "mouse press button=wheel up col=1 row=1",
  );
  expect(describeMouseReport("\x1b[<32;3;4M")).toBe(
    "mouse drag button=0 col=3 row=4",
  );
  expect(describeMouseReport("abc")).toBeNull();
});
