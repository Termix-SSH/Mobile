const assert = require("node:assert/strict");
const test = require("node:test");
const { buildBody } = require("./generate-release-body.cjs");

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
  const body = buildBody(changelog, "1.6.0");
  assert.match(
    body,
    /^> \[!WARNING\]\n> Requires Termix v26\.10\.0\+\n\nNew things\./,
  );
  assert.match(body, /release-1\.6\.0-tag\/termix_android\.apk/);
  assert.match(body, /release-1\.6\.0-tag\/termix_ios\.ipa/);
  assert.ok(body.indexOf("| Platform") < body.indexOf("### Added"));
  assert.match(body, /### Fixed\n\n- Bug one\n$/);
  assert.doesNotMatch(body, /Old bug/);
});

test("the last section ends at the end of the file", () => {
  assert.match(buildBody(changelog, "1.5.1"), /- Old bug\n$/);
});

test("returns null for a version with no notes", () => {
  assert.equal(buildBody(changelog, "9.9.9"), null);
});
