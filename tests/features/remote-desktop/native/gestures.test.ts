import {
  DisplayGestures,
  LEFT,
  LONG_PRESS_MS,
  MIDDLE,
  RIGHT,
  WHEEL_DOWN,
  WHEEL_UP,
  type GestureAction,
} from "@/features/remote-desktop/native/gestures";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  toRemote,
  type Viewport,
} from "@/features/remote-desktop/viewport";

// A 1000x500 view showing a 2000x1000 desktop: half size, so view (x, y) is remote (2x, 2y).
const view = (over: Partial<Viewport> = {}): Viewport => ({
  viewW: 1000,
  viewH: 500,
  remoteW: 2000,
  remoteH: 1000,
  zoom: 1,
  panX: 0,
  panY: 0,
  ...over,
});

const pointers = (actions: GestureAction[]) =>
  actions
    .filter((a) => a.kind === "pointer")
    .map((a) => (a.kind === "pointer" ? [a.x, a.y, a.buttons] : []));

function tap(g: DisplayGestures, p: { x: number; y: number }, t = 0, ms = 50) {
  g.begin([p], t);
  return g.end(0, t + ms);
}

describe("touch mode", () => {
  test("a tap clicks under the finger", () => {
    const g = new DisplayGestures(view());
    expect(pointers(tap(g, { x: 100, y: 50 }))).toEqual([
      [200, 100, LEFT],
      [200, 100, 0],
    ]);
  });

  test("a long press is a right click", () => {
    const g = new DisplayGestures(view());
    expect(pointers(tap(g, { x: 100, y: 50 }, 0, LONG_PRESS_MS))).toEqual([
      [200, 100, RIGHT],
      [200, 100, 0],
    ]);
  });

  test("a drag holds the left button from where it started", () => {
    const g = new DisplayGestures(view());
    g.begin([{ x: 100, y: 100 }], 0);
    expect(g.move([{ x: 103, y: 100 }])).toEqual([]);
    expect(pointers(g.move([{ x: 150, y: 100 }]))).toEqual([
      [200, 200, LEFT],
      [300, 200, LEFT],
    ]);
    expect(pointers(g.end(0, 500))).toEqual([[300, 200, 0]]);
  });

  test("touches at the side edges are left to the system", () => {
    const g = new DisplayGestures(view());
    expect(tap(g, { x: 5, y: 100 })).toEqual([]);
    expect(tap(g, { x: 995, y: 100 })).toEqual([]);
  });

  test("held bar buttons ride along with every event", () => {
    const g = new DisplayGestures(view());
    g.held = RIGHT;
    expect(pointers(tap(g, { x: 100, y: 50 }))[1]).toEqual([200, 100, RIGHT]);
  });
});

describe("trackpad mode", () => {
  test("moves a cursor relative to the finger and taps click there", () => {
    const g = new DisplayGestures(view(), "trackpad");
    expect(g.cursor).toEqual({ x: 1000, y: 500 });
    g.begin([{ x: 500, y: 250 }], 0);
    const moved = pointers(g.move([{ x: 520, y: 250 }]));
    // 20 points at speed 1.8 over a 0.5 scale is 72 remote pixels.
    expect(moved).toEqual([[1072, 500, 0]]);
    g.end(0, 400);
    expect(pointers(tap(g, { x: 10 + 500, y: 300 }, 1000))).toEqual([
      [1072, 500, LEFT],
      [1072, 500, 0],
    ]);
  });

  test("tap then drag holds the left button", () => {
    const g = new DisplayGestures(view(), "trackpad");
    tap(g, { x: 500, y: 250 }, 0);
    g.begin([{ x: 500, y: 250 }], 150);
    const drag = pointers(g.move([{ x: 520, y: 250 }]));
    expect(drag[0][2]).toBe(LEFT);
    expect(pointers(g.end(0, 400))).toEqual([[drag[0][0], drag[0][1], 0]]);
  });

  test("two and three finger taps are right and middle clicks", () => {
    const g = new DisplayGestures(view(), "trackpad");
    g.begin([{ x: 100, y: 100 }], 0);
    g.begin(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      10,
    );
    g.end(1, 60);
    expect(pointers(g.end(0, 70)).map((p) => p[2])).toEqual([RIGHT, 0]);

    g.begin([{ x: 100, y: 100 }], 1000);
    g.begin(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 300, y: 100 },
      ],
      1010,
    );
    expect(pointers(g.end(0, 1080)).map((p) => p[2])).toEqual([MIDDLE, 0]);
  });
});

describe("two fingers", () => {
  test("a two finger drag scrolls one tick per 40 points", () => {
    const g = new DisplayGestures(view());
    const a = { x: 100, y: 100 };
    const b = { x: 200, y: 100 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    expect(
      g.move([
        { x: 100, y: 120 },
        { x: 200, y: 120 },
      ]),
    ).toEqual([]);
    expect(
      pointers(
        g.move([
          { x: 100, y: 145 },
          { x: 200, y: 145 },
        ]),
      ).map((p) => p[2]),
    ).toEqual([WHEEL_UP, 0]);
    expect(
      pointers(
        g.move([
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ]),
      ).map((p) => p[2]),
    ).toEqual([WHEEL_DOWN, 0]);
    // A drag is not a tap.
    expect(g.end(0, 100)).toEqual([]);
  });

  test("a pinch zooms around the fingers within the zoom limits", () => {
    const g = new DisplayGestures(view());
    const a = { x: 400, y: 250 };
    const b = { x: 600, y: 250 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    const out = g.move([
      { x: 300, y: 250 },
      { x: 700, y: 250 },
    ]);
    const last = out.at(-1);
    expect(last?.kind).toBe("view");
    if (last?.kind === "view") {
      expect(last.view.zoom).toBe(2);
      // The remote point under the middle stays under it.
      expect(last.view.panX).toBe(500);
    }
    const shrink = g.move([
      { x: 490, y: 250 },
      { x: 510, y: 250 },
    ]);
    // 200 apart to 20 apart is 0.1, clamped at MIN_ZOOM.
    expect(shrink.at(-1)?.kind === "view" && shrink.at(-1)).toMatchObject({
      view: { zoom: MIN_ZOOM, panX: 0, panY: 0 },
    });
    // 200 apart to 2000 apart is 10, clamped at MAX_ZOOM.
    const grow = g.move([
      { x: -500, y: 250 },
      { x: 1500, y: 250 },
    ]);
    expect(grow.at(-1)?.kind === "view" && grow.at(-1)).toMatchObject({
      view: { zoom: MAX_ZOOM },
    });
    expect(g.end(0, 100)).toEqual([]);
  });

  test("a two finger drag pans the view when zoomed in", () => {
    // Zoom 4 is scale 2: 500x250 remote pixels visible, pan up to 1500x750.
    const g = new DisplayGestures(view());
    g.setView(view({ zoom: 4, panX: 500, panY: 250 }));
    const a = { x: 400, y: 250 };
    const b = { x: 600, y: 250 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    const out = g.move([
      { x: 300, y: 200 },
      { x: 500, y: 200 },
    ]);
    expect(pointers(out)).toEqual([]);
    // The content follows the fingers: (-100, -50) points is (+50, +25) remote.
    expect(out).toEqual([
      { kind: "view", view: view({ zoom: 4, panX: 550, panY: 275 }) },
    ]);
    expect(g.view).toEqual(view({ zoom: 4, panX: 550, panY: 275 }));
    // Clamped at the edges.
    const edge = g.move([
      { x: 2300, y: -1800 },
      { x: 2500, y: -1800 },
    ]);
    expect(pointers(edge)).toEqual([]);
    expect(edge).toEqual([
      { kind: "view", view: view({ zoom: 4, panX: 0, panY: 750 }) },
    ]);
    // A pan is not a tap.
    expect(g.end(0, 100)).toEqual([]);
  });

  test("a pinch after a pan against the edge does not jump", () => {
    // Zoom 2 is scale 1: view points are remote pixels, pan up to 1000x500.
    const g = new DisplayGestures(view());
    g.setView(view({ zoom: 2, panX: 100, panY: 250 }));
    const a = { x: 400, y: 250 };
    const b = { x: 600, y: 250 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    // Midpoint 500 to 700 hits the left edge (panX 0), then back to 600.
    g.move([
      { x: 600, y: 250 },
      { x: 800, y: 250 },
    ]);
    expect(g.view.panX).toBe(0);
    g.move([
      { x: 500, y: 250 },
      { x: 700, y: 250 },
    ]);
    expect(g.view.panX).toBe(100);
    const anchor = toRemote(g.view, 600, 250);
    // 200 apart to 220 apart around the same midpoint pinches to zoom 2.2.
    const out = g.move([
      { x: 490, y: 250 },
      { x: 710, y: 250 },
    ]);
    expect(out.at(-1)?.kind).toBe("view");
    expect(g.view.zoom).toBeCloseTo(2.2);
    const under = toRemote(g.view, 600, 250);
    expect(under.x).toBeCloseTo(anchor.x);
    expect(under.y).toBeCloseTo(anchor.y);
    expect(g.view.panX).toBeCloseTo(154.545, 2);
    expect(g.end(0, 100)).toEqual([]);
  });

  test("many tiny two finger moves add up to a pan, not a tap", () => {
    const g = new DisplayGestures(view());
    g.setView(view({ zoom: 2, panX: 500, panY: 250 }));
    const a = { x: 400, y: 250 };
    const b = { x: 600, y: 250 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    const out: GestureAction[] = [];
    for (let i = 1; i <= 30; i++) {
      out.push(
        ...g.move([
          { x: 400 + i * 0.4, y: 250 },
          { x: 600 + i * 0.4, y: 250 },
        ]),
      );
    }
    expect(out).toHaveLength(30);
    expect(out.every((act) => act.kind === "view")).toBe(true);
    // 12 points in all: no right click on release.
    expect(g.end(0, 100)).toEqual([]);
  });

  test("a stationary quick two finger tap is still a right click", () => {
    const g = new DisplayGestures(view());
    g.setView(view({ zoom: 2, panX: 500, panY: 250 }));
    const a = { x: 400, y: 250 };
    const b = { x: 600, y: 250 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    g.move([
      { x: 400.3, y: 250 },
      { x: 600.3, y: 250 },
    ]);
    expect(pointers(g.end(0, 100)).map((p) => p[2])).toEqual([RIGHT, 0]);
  });

  test("a two finger drag scrolls again after zooming out", () => {
    const g = new DisplayGestures(view());
    g.setView(view({ zoom: 2, panX: 500, panY: 250 }));
    const a = { x: 400, y: 250 };
    const b = { x: 600, y: 250 };
    g.begin([a], 0);
    g.begin([a, b], 0);
    const shrink = g.move([
      { x: 460, y: 250 },
      { x: 540, y: 250 },
    ]);
    // 200 apart to 80 apart takes zoom 2 to 0.8: the desktop fits again.
    const zoomed = shrink.at(-1);
    expect(zoomed?.kind).toBe("view");
    if (zoomed?.kind === "view") {
      expect(zoomed.view.zoom).toBeCloseTo(0.8);
      expect(zoomed.view.panX).toBe(0);
      expect(zoomed.view.panY).toBe(0);
    }
    expect(g.end(0, 100)).toEqual([]);

    g.begin([a], 1000);
    g.begin([a, b], 1000);
    expect(
      pointers(
        g.move([
          { x: 400, y: 295 },
          { x: 600, y: 295 },
        ]),
      ).map((p) => p[2]),
    ).toEqual([WHEEL_UP, 0]);
    expect(g.view.zoom).toBeCloseTo(0.8);
    expect(g.end(0, 1100)).toEqual([]);
  });
});

test("a smaller view keeps the cursor inside the desktop", () => {
  const g = new DisplayGestures(view(), "trackpad");
  g.cursor = { x: 1999, y: 999 };
  g.setView(view({ remoteW: 800, remoteH: 600 }));
  expect(g.cursor).toEqual({ x: 799, y: 599 });
});
