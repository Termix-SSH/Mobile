import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { findUnlabeled } = require("../../scripts/check-a11y-labels.cjs");

const root = path.join(__dirname, "../..");

test("every pressable in the app has a screen reader name", () => {
  expect(findUnlabeled(root)).toEqual([]);
});

test("the check finds an icon only button and accepts text or a label", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(
    path.join(dir, "src", "View.tsx"),
    [
      "export const A = () => (",
      "  <>",
      "    <Pressable onPress={go}><ArrowLeft size={18} color={c('x')} /></Pressable>",
      "    <Pressable onPress={go}><Text>Save</Text></Pressable>",
      '    <Pressable onPress={go} accessibilityLabel="Back"><ArrowLeft /></Pressable>',
      "    <Pressable onPress={go}>{open ? <Up /> : <Down />}</Pressable>",
      "  </>",
      ");",
    ].join("\n"),
  );
  expect(findUnlabeled(dir, ["src"])).toEqual([
    "src/View.tsx:3",
    "src/View.tsx:6",
  ]);
});
