const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(
  "app/tabs/sessions/remote-desktop/RemoteDesktop.tsx",
  "utf8",
);
const block = source
  .slice(
    source.indexOf("      // The server owns"),
    source.indexOf("      // ── Touch mode"),
  )
  .replace("${JSON.stringify(initialSizeRef.current.width)}", "1280")
  .replace("${JSON.stringify(initialSizeRef.current.height)}", "720");
const display = {
  scale(value) {
    this.currentScale = value;
  },
};
const element = { style: {} };
const window = {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener(_, cb) {
    this.resize = cb;
  },
};
const context = vm.createContext({ display, displayElement: element, window });
vm.runInContext(block, context);
// A fixed-size VNC server ignores the requested viewport and returns a large canvas.
display.onresize(2560, 1600);
assert.equal(display.currentScale, 0.4);
assert.equal(vm.runInContext("toRemote(1024, 640).x", context), 2560);
assert.equal(vm.runInContext("toRemote(1024, 640).y", context), 1600);
// Zoom/pan reaches the bottom-right using the same scale as rendering.
vm.runInContext(
  "zoom = 2; panX = 9999; panY = 9999; clampPan(); applyTransform()",
  context,
);
assert.equal(vm.runInContext("toRemote(1024, 768).x", context), 2560);
assert.equal(vm.runInContext("toRemote(1024, 768).y", context), 1600);
// Rotation refits without changing the authoritative framebuffer size.
window.innerWidth = 768;
window.innerHeight = 1024;
vm.runInContext("zoom = 1", context);
window.resize();
assert.equal(display.currentScale, 0.3);
assert.equal(vm.runInContext("panX + panY", context), 0);
display.onresize(0, 0);
assert.equal(display.currentScale, 0.3);
assert(!source.includes("width: 100% !important"));
console.log("Remote viewport regression checks passed");
