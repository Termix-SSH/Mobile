import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  clampPan,
  fitScale,
  fitsInView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
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
  expect(zoomAround(view(), 0.2, 0, 0, 0, 0).zoom).toBe(MIN_ZOOM);
  expect(zoomAround(view(), 20, 0, 0, 0, 0).zoom).toBe(MAX_ZOOM);
});

test("zooming out below fit shrinks the desktop and pins it top left", () => {
  const v = zoomAround(view(), 0.5, 512, 384, 512, 384);
  expect(v.zoom).toBe(0.5);
  expect({ panX: v.panX, panY: v.panY }).toEqual({ panX: 0, panY: 0 });
  const clamped = clampPan(view({ zoom: 0.5, panX: 300, panY: -40 }));
  expect({ panX: clamped.panX, panY: clamped.panY }).toEqual({
    panX: 0,
    panY: 0,
  });
});

test("fitsInView is true at fit and below, false when zoomed in", () => {
  expect(fitsInView(view())).toBe(true);
  expect(fitsInView(view({ zoom: 0.5 }))).toBe(true);
  expect(fitsInView(view({ zoom: MIN_ZOOM }))).toBe(true);
  expect(fitsInView(view({ zoom: 2 }))).toBe(false);
});

test("two finger panning moves the content with the fingers", () => {
  const v = view({ zoom: 2 });
  const scale = fitScale(v) * v.zoom;
  const left = panBy(v, -100, 0);
  expect(left.panX).toBeCloseTo(100 / scale);
  expect(left.panY).toBe(0);

  const edge = panBy(view({ zoom: 2, panX: 1200, panY: 10 }), -1000, 500);
  expect(edge.panX).toBeCloseTo(2560 - 1024 / scale);
  expect(edge.panY).toBe(0);

  const shrunk = panBy(view({ zoom: 0.5 }), -300, -300);
  expect({ panX: shrunk.panX, panY: shrunk.panY }).toEqual({
    panX: 0,
    panY: 0,
  });
  const fitted = panBy(view(), -300, -300);
  expect(fitted.panX).toBeCloseTo(0);
  expect(fitted.panY).toBe(0);
});

test("the page script matches the shared math", () => {
  for (const v of [
    view(),
    view({ viewW: 390, viewH: 700, zoom: 3, panX: 800, panY: 9999 }),
    view({ remoteW: 1280, remoteH: 720, zoom: 1.5, panX: -10, panY: 20 }),
    view({ zoom: 0.5, panX: 300, panY: -40 }),
  ]) {
    const run = page(v);
    expect(run("MIN_ZOOM")).toBe(MIN_ZOOM);
    expect(run("MAX_ZOOM")).toBe(MAX_ZOOM);
    expect(run("fitScale()")).toBe(fitScale(v));
    expect(run("toRemote(100, 200)")).toEqual(toRemote(v, 100, 200));
    expect(run("fitsInView()")).toBe(fitsInView(v));
    run("clampPan()");
    const clamped = clampPan(v);
    expect(run("panX")).toBe(clamped.panX);
    expect(run("panY")).toBe(clamped.panY);

    const drag = page(v);
    drag("panBy(-120, 80)");
    const panned = panBy(v, -120, 80);
    expect(drag("panX")).toBe(panned.panX);
    expect(drag("panY")).toBe(panned.panY);
  }
});

test("the page uses the shared script and is not forced to full width", () => {
  expect(source).toContain("${VIEWPORT_SCRIPT}");
  expect(source).not.toContain("width: 100% !important");
});

test("the page pinches past fit and pans with two fingers when it overflows", () => {
  const start = source.indexOf("addEventListener('touchmove'");
  const end = source.indexOf("addEventListener('touchend'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const touchMove = source.slice(start, end);

  expect(source).not.toContain("Math.max(1, Math.min(8");
  expect(touchMove).toContain("Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,");
  expect(touchMove).toContain("if (!fitsInView())");
  expect(touchMove).toContain("panBy(dragDX, dragDY)");
  expect(touchMove).not.toContain("zoom > 1");
  // These come from VIEWPORT_SCRIPT; redeclaring a const would throw.
  expect(source).not.toMatch(
    /\b(const|let|var)\s+(MIN_ZOOM|MAX_ZOOM|fitsInView|panBy)\b/,
  );
});
