import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  clampPan,
  fitScale,
  toRemote,
  VIEWPORT_SCRIPT,
  zoomAround,
  type Viewport,
} from "@/features/remote-desktop/viewport";

const source = fs.readFileSync(
  path.join(
    __dirname,
    "../../../src/features/remote-desktop/RemoteDesktop.tsx",
  ),
  "utf8",
);

const view = (over: Partial<Viewport> = {}): Viewport => ({
  viewW: 1024,
  viewH: 768,
  remoteW: 2560,
  remoteH: 1600,
  zoom: 1,
  panX: 0,
  panY: 0,
  ...over,
});

function page(v: Viewport) {
  const context = vm.createContext({
    window: { innerWidth: v.viewW, innerHeight: v.viewH },
    remoteW: v.remoteW,
    remoteH: v.remoteH,
    zoom: v.zoom,
    panX: v.panX,
    panY: v.panY,
  });
  vm.runInContext(VIEWPORT_SCRIPT.replace(/const /g, "var "), context);
  return (code: string) => vm.runInContext(code, context);
}

test("a fixed size server is fitted and touch maps to its framebuffer", () => {
  const v = view();
  expect(fitScale(v)).toBe(0.4);
  expect(toRemote(v, 1024, 640)).toEqual({ x: 2560, y: 1600 });
  const zoomed = clampPan(view({ zoom: 2, panX: 9999, panY: 9999 }));
  expect(toRemote(zoomed, 1024, 768)).toEqual({ x: 2560, y: 1600 });
});

test("rotation refits without changing the framebuffer size", () => {
  const v = clampPan(view({ viewW: 768, viewH: 1024, panX: 50, panY: 50 }));
  expect(fitScale(v)).toBe(0.3);
  expect(v.panX + v.panY).toBe(0);
});

test("zooming keeps the point under the fingers", () => {
  const v = zoomAround(view(), 2, 512, 384, 512, 384);
  expect(v.zoom).toBe(2);
  expect(toRemote(v, 512, 384)).toEqual({ x: 1280, y: 960 });
  expect(zoomAround(view(), 0.2, 0, 0, 0, 0).zoom).toBe(1);
});

test("the page script matches the shared math", () => {
  for (const v of [
    view(),
    view({ viewW: 390, viewH: 700, zoom: 3, panX: 800, panY: 9999 }),
    view({ remoteW: 1280, remoteH: 720, zoom: 1.5, panX: -10, panY: 20 }),
  ]) {
    const run = page(v);
    expect(run("fitScale()")).toBe(fitScale(v));
    expect(run("toRemote(100, 200)")).toEqual(toRemote(v, 100, 200));
    run("clampPan()");
    const clamped = clampPan(v);
    expect(run("panX")).toBe(clamped.panX);
    expect(run("panY")).toBe(clamped.panY);
  }
});

test("the page uses the shared script and is not forced to full width", () => {
  expect(source).toContain("${VIEWPORT_SCRIPT}");
  expect(source).not.toContain("width: 100% !important");
});
