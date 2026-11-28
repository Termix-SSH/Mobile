import { frameDevice } from "@/features/plugin-webview/device";

test("plugins hear tablet when both sides fit two panes", () => {
  expect(frameDevice({ width: 390, height: 844 })).toBe("phone");
  expect(frameDevice({ width: 844, height: 390 })).toBe("phone");
  expect(frameDevice({ width: 820, height: 1180 })).toBe("tablet");
  expect(frameDevice({ width: 600, height: 600 })).toBe("tablet");
  expect(frameDevice({ width: 599, height: 900 })).toBe("phone");
});
