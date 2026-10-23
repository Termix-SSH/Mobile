import {
  percentile,
  round1,
  summarizeFrames,
  throughputMBs,
} from "@/screens/dev/terminal-lab/metrics";

test("percentile picks the nearest rank", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  expect(percentile(sorted, 50)).toBe(5);
  expect(percentile(sorted, 95)).toBe(10);
  expect(percentile([], 50)).toBe(0);
});

test("steady 60 Hz frames", () => {
  const s = summarizeFrames(Array(60).fill(1000 / 60));
  expect(Math.round(s.fps)).toBe(60);
  expect(s.dropped).toBe(0);
  expect(s.frames).toBe(60);
});

test("long frames count as dropped", () => {
  const s = summarizeFrames([16.7, 16.7, 50, 16.7, 30]);
  expect(s.dropped).toBe(2);
  expect(s.max).toBe(50);
});

test("120 Hz budget is tighter", () => {
  expect(summarizeFrames([16.7], 120).dropped).toBe(1);
  expect(summarizeFrames([16.7], 60).dropped).toBe(0);
});

test("empty capture", () => {
  expect(summarizeFrames([])).toEqual({
    frames: 0,
    fps: 0,
    p50: 0,
    p95: 0,
    max: 0,
    dropped: 0,
  });
});

test("throughput and rounding", () => {
  expect(throughputMBs(10 * 1024 * 1024, 2000)).toBe(5);
  expect(throughputMBs(1, 0)).toBe(0);
  expect(round1(1.26)).toBe(1.3);
});
