import fs from "node:fs";
import path from "node:path";
import { THEME_VARS } from "@/constants/theme";

const {
  render,
  resourceName,
  drawables,
} = require("../../scripts/generate-widget-themes.cjs");

test("every app theme has Android widget drawables", () => {
  const files = render();
  for (const id of Object.keys(THEME_VARS)) {
    const name = resourceName(id);
    expect(files).toHaveProperty([`termix_widget_background_${name}.xml`]);
    expect(files).toHaveProperty([`termix_widget_card_${name}.xml`]);
  }
});

test("the checked in drawables match the themes (run npm run widget-themes)", () => {
  for (const [file, content] of Object.entries(render())) {
    expect(fs.readFileSync(path.join(drawables, file), "utf8")).toBe(content);
  }
});

test("theme ids become valid resource names", () => {
  expect(resourceName("tokyo-night")).toBe("tokyo_night");
  expect(resourceName("one-dark")).toBe("one_dark");
});
