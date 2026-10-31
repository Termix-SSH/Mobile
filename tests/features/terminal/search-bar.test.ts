import { searchLabel } from "@/features/terminal/SearchBar";

test("the count reads like the web terminal's", () => {
  expect(searchLabel({ total: 0, index: -1 }, "")).toBe("");
  expect(searchLabel({ total: 0, index: -1 }, "x")).toBe("No results");
  expect(searchLabel({ total: 5, index: 4 }, "x")).toBe("5 of 5");
  expect(searchLabel({ total: 5, index: -1 }, "x")).toBe("5");
});
