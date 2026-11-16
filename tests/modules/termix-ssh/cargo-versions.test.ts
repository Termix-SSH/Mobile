import fs from "node:fs";
import path from "node:path";

const lock = fs.readFileSync(
  path.join(__dirname, "../../../modules/termix-ssh/rust/Cargo.lock"),
  "utf8",
);

function versionsOf(name: string): number[][] {
  const re = new RegExp(`name = "${name}"\nversion = "([^"]+)"`, "g");
  return [...lock.matchAll(re)].map((m) => m[1].split(".").map(Number));
}

function atLeast(found: number[], min: number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    if ((found[i] ?? 0) !== min[i]) return (found[i] ?? 0) > min[i];
  }
  return true;
}

describe("SSH engine crates with security fixes", () => {
  it.each([
    ["russh", [0, 65, 0]],
    ["pageant", [0, 2, 5]],
    ["rustix", [1, 1, 6]],
  ])("%s is at least the fixed release", (name, min) => {
    const found = versionsOf(name as string);
    expect(found.length).toBeGreaterThan(0);
    for (const version of found) {
      expect(atLeast(version, min as number[])).toBe(true);
    }
  });
});
