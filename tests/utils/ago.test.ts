import { ago } from "@/utils/ago";

const now = Date.parse("2026-11-19T12:00:00Z");
const before = (ms: number) => new Date(now - ms).toISOString();

test("short times read as minutes, hours and days", () => {
  expect(ago(before(10_000), now)).toBe("just now");
  expect(ago(before(5 * 60_000), now)).toBe("5m ago");
  expect(ago(before(3 * 3_600_000), now)).toBe("3h ago");
  expect(ago(before(2 * 86_400_000), now)).toBe("2d ago");
});

test("old times show a date and bad input shows nothing", () => {
  expect(ago(before(30 * 86_400_000), now)).not.toMatch(/ago/);
  expect(ago(null, now)).toBe("");
  expect(ago("nope", now)).toBe("");
});
