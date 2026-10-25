import {
  describeStartup,
  markStartup,
  resetStartupMarksForTests,
  startupMarks,
} from "@/core/perf/marks";

beforeEach(resetStartupMarksForTests);

test("each step is kept the first time only", () => {
  markStartup("bundle", 400.4);
  markStartup("bundle", 900);
  markStartup("ready", 830.6);
  expect(startupMarks()).toEqual({ bundle: 400, ready: 831 });
  expect(describeStartup()).toBe("bundle 400 ms | ready 831 ms");
});
