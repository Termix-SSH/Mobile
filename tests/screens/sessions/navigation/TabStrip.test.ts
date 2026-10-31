import { dropIndex } from "@/screens/sessions/navigation/TabStrip";

jest.mock("@/core/features", () => ({ features: {} }));
jest.mock("@/core/sessions/status", () => ({ useSessionStatuses: () => ({}) }));

const ids = ["a", "b", "c"];
const boxes = {
  a: { x: 0, width: 100 },
  b: { x: 104, width: 100 },
  c: { x: 208, width: 100 },
};

test("a tab dropped past its neighbor's middle takes its place", () => {
  expect(dropIndex(ids, boxes, "a", 120)).toBe(1);
  expect(dropIndex(ids, boxes, "a", 230)).toBe(2);
  expect(dropIndex(ids, boxes, "c", -230)).toBe(0);
});

test("a short drag leaves the tab where it was", () => {
  expect(dropIndex(ids, boxes, "b", 20)).toBe(1);
  expect(dropIndex(ids, boxes, "b", -20)).toBe(1);
});

test("a tab with no layout yet stays put", () => {
  expect(dropIndex(ids, {}, "b", 300)).toBe(1);
});
