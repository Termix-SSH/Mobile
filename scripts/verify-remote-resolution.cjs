const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync(
  "app/tabs/sessions/remote-desktop/remoteDesktopSize.ts",
  "utf8",
);
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
const size = (...args) =>
  JSON.parse(JSON.stringify(context.exports.resolveRemoteDesktopSize(...args)));
assert.deepEqual(size({ width: 1920, height: 1080 }, 400, 700, 3), {
  width: 1920,
  height: 1080,
});
assert.deepEqual(size('{"width":"1920","height":"1080"}', 700, 200, 3), {
  width: 1920,
  height: 1080,
});
assert.deepEqual(size({ width: "auto", height: "auto" }, 400, 700, 3), {
  width: 1200,
  height: 2100,
});
assert.deepEqual(size({ width: 1920 }, 400, 700, 2), {
  width: 1920,
  height: 1400,
});
for (const config of [null, "", "{", [], { width: -1, height: false }]) {
  assert.deepEqual(size(config, 400, 700, 1), { width: 400, height: 700 });
}
console.log("Remote resolution regression checks passed");
