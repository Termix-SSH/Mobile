import { fromBase64, utf8Decode } from "@/modules/termix-ssh";
import {
  EchoSource,
  FloodSource,
  SshSource,
  b64,
} from "@/screens/dev/terminal-lab/sources";

const text = (b: string) => utf8Decode(fromBase64(b));

let frames: (() => void)[] = [];
let now = 0;

beforeEach(() => {
  frames = [];
  now = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  global.requestAnimationFrame = ((cb: () => void) => {
    frames.push(cb);
    return frames.length;
  }) as unknown as typeof requestAnimationFrame;
  global.cancelAnimationFrame = jest.fn(() => {
    frames = [];
  });
});

afterEach(() => jest.restoreAllMocks());

function step(ms: number) {
  now += ms;
  const run = frames;
  frames = [];
  run.forEach((f) => f());
}

test("flood paces to the target rate", () => {
  const writes: string[] = [];
  const flood = new FloodSource("yes", 1);
  flood.start((d) => writes.push(d));
  for (let i = 0; i < 10; i++) step(100);
  // 1 MB/s for one second, in 32 KB chunks, overshooting by at most one.
  expect(flood.bytes).toBeGreaterThanOrEqual(1024 * 1024);
  expect(flood.bytes).toBeLessThan(1024 * 1024 + 32 * 1024 * 2);
  expect(text(writes[0]).startsWith("y\ny\n")).toBe(true);
  flood.stop();
  expect(frames).toHaveLength(0);
});

test("unlimited flood sends 512 KB a frame", () => {
  const flood = new FloodSource("log", 0);
  flood.start(() => {});
  step(16);
  expect(flood.bytes).toBeGreaterThanOrEqual(512 * 1024);
  flood.stop();
});

test("flood reports ctrl c", () => {
  const onCtrlC = jest.fn();
  const flood = new FloodSource("yes", 1, onCtrlC);
  flood.input(b64("a"));
  expect(onCtrlC).not.toHaveBeenCalled();
  flood.input(b64("\x03"));
  expect(onCtrlC).toHaveBeenCalled();
});

test("echo source starts yes and stops it on ctrl c", () => {
  const writes: string[] = [];
  const echo = new EchoSource(1);
  echo.start((d) => writes.push(d));
  expect(text(writes[0])).toContain("Truecolor");
  echo.input(b64("yes\r"));
  step(100);
  const during = echo.bytes;
  expect(during).toBeGreaterThan(50_000);
  echo.input(b64("\x03"));
  expect(text(writes[writes.length - 1])).toContain("lab");
  step(100);
  expect(echo.bytes).toBe(
    during + utf8Decode(fromBase64(writes[writes.length - 1])).length,
  );
  echo.stop();
});

test("echo source animates the alt screen", () => {
  jest.useFakeTimers({ doNotFake: ["Date"] });
  const writes: string[] = [];
  const echo = new EchoSource();
  echo.resize(40, 10);
  echo.start((d) => writes.push(d));
  echo.startAlt();
  const before = writes.length;
  jest.advanceTimersByTime(100);
  expect(writes.length).toBeGreaterThan(before + 1);
  echo.input(b64("q"));
  const after = writes.length;
  jest.advanceTimersByTime(100);
  expect(writes.length).toBe(after);
  echo.stop();
  jest.useRealTimers();
});

test("ssh source says when the engine is missing", async () => {
  const writes: string[] = [];
  const ssh = new SshSource(
    { host: "h", port: 22, username: "u", password: "p" },
    () => {},
  );
  await ssh.start((d) => writes.push(d));
  expect(text(writes[0])).toContain("not in this build");
});
