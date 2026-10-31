const { buildBody } = require("../../scripts/generate-release-body.cjs");

const changelog = `# Changelog

## 1.6.0

> [!WARNING]
> Requires Termix v26.10.0+

New things.

### Added

- Thing one

### Fixed

- Bug one

## 1.5.1

Older notes.

### Fixed

- Old bug
`;

test("builds the body from the version's section only", () => {
  const body: string = buildBody(changelog, "1.6.0");
  expect(body).toMatch(
    /^> \[!WARNING\]\n> Requires Termix v26\.10\.0\+\n\nNew things\./,
  );
  expect(body).toMatch(/download\/v1\.6\.0\/termix_android\.apk/);
  expect(body).toMatch(/download\/v1\.6\.0\/termix_ios\.ipa/);
  expect(body.indexOf("| Platform")).toBeLessThan(body.indexOf("### Added"));
  expect(body).toMatch(/### Fixed\n\n- Bug one\n$/);
  expect(body).not.toMatch(/Old bug/);
});

test("the last section ends at the end of the file", () => {
  expect(buildBody(changelog, "1.5.1")).toMatch(/- Old bug\n$/);
});

test("returns null for a version with no notes", () => {
  expect(buildBody(changelog, "9.9.9")).toBeNull();
});
