import fs from "fs";
import path from "path";

const dir = path.join(__dirname, "../../fastlane/metadata/android/en-US");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const { versionCode } = require("../../scripts/fdroid.cjs");
const { version } = require("../../app.json").expo;

test("store texts fit the F-Droid limits", () => {
  expect(read("title.txt").length).toBeLessThanOrEqual(50);
  expect(read("short_description.txt").length).toBeLessThanOrEqual(80);
  expect(read("full_description.txt").length).toBeLessThanOrEqual(4000);
});

test("there is a changelog named after the version code, within 500 chars", () => {
  const file = `changelogs/${versionCode(version)}.txt`;
  expect(fs.existsSync(path.join(dir, file))).toBe(true);
  expect(read(file).length).toBeLessThanOrEqual(500);
});

test("store texts have no em or en dash", () => {
  for (const f of [
    "title.txt",
    "short_description.txt",
    "full_description.txt",
  ]) {
    expect(read(f)).not.toMatch(/[\u2013\u2014]/);
  }
});

test("the icon and feature graphic exist", () => {
  expect(fs.existsSync(path.join(dir, "images/icon.png"))).toBe(true);
  expect(fs.existsSync(path.join(dir, "images/featureGraphic.png"))).toBe(true);
});

test("the recipe uses the same version name and code", () => {
  const yml = fs.readFileSync(
    path.join(__dirname, "../../docs/fdroid/com.karmaa.termix.yml"),
    "utf8",
  );
  expect(yml).toContain(`versionName: ${version}`);
  expect(yml).toContain(`versionCode: ${versionCode(version)}`);
});

// F-Droid's update bot reads this from app.json at each tag
test("app.json has the version code for the version", () => {
  const { android } = require("../../app.json").expo;
  expect(android.versionCode).toBe(versionCode(version));
});
