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

describe("responder lifecycle", () => {
  const a = { x: 400, y: 250 };
  const b = { x: 600, y: 250 };

  // What React Native sends for a pinch: the last finger's end never comes,
  // only one end with a finger left, then the release.
  function pinchWithoutLastEnd(g: DisplayGestures, grant: boolean) {
    if (grant) g.grant([a], 0);
    else g.begin([a], 0);
    g.begin([a], 0);
    g.begin([a, b], 10);
    g.move([
      { x: 300, y: 250 },
      { x: 700, y: 250 },
    ]);
    expect(g.view.zoom).toBe(2);
    expect(g.end(1, 100)).toEqual([]);
  }

  const clickAt = (g: DisplayGestures, x: number, y: number) => {
    const r = toRemote(g.view, x, y);
    return [
      [Math.round(r.x), Math.round(r.y), LEFT],
      [Math.round(r.x), Math.round(r.y), 0],
    ];
  };

  test("the first tap after a pinch whose last end was missing clicks", () => {
    const g = new DisplayGestures(view());
    pinchWithoutLastEnd(g, true);
    expect(g.release(100)).toEqual([]);
    const p = { x: 100, y: 50 };
    g.grant([p], 1000);
    g.begin([p], 1000);
    expect(pointers(g.end(0, 1050))).toEqual(clickAt(g, 100, 50));
    expect(g.release(1050)).toEqual([]);
  });

  test("the release alone finishes the pinch", () => {
    const g = new DisplayGestures(view());
    pinchWithoutLastEnd(g, false);
    expect(g.release(100)).toEqual([]);
    expect(pointers(tap(g, { x: 100, y: 50 }, 1000))).toEqual(
      clickAt(g, 100, 50),
    );
  });

  test("a new grant starts clean even without a release", () => {
    const g = new DisplayGestures(view());
    pinchWithoutLastEnd(g, true);
    const p = { x: 100, y: 50 };
    expect(g.grant([p], 1000)).toEqual([]);
    expect(pointers(g.end(0, 1050))).toEqual(clickAt(g, 100, 50));
  });

  test("a release after the last end changes nothing", () => {
    const g = new DisplayGestures(view());
    expect(pointers(tap(g, { x: 100, y: 50 }))).toEqual([
      [200, 100, LEFT],
      [200, 100, 0],
    ]);
    expect(g.release(60)).toEqual([]);
    expect(pointers(tap(g, { x: 100, y: 50 }, 1000))).toEqual([
      [200, 100, LEFT],
      [200, 100, 0],
    ]);
    expect(g.release(1060)).toEqual([]);
  });

  test("a trackpad tap then drag still holds the left button", () => {
    const g = new DisplayGestures(view(), "trackpad");
    g.grant([{ x: 500, y: 250 }], 0);
    expect(pointers(g.end(0, 50)).map((p) => p[2])).toEqual([LEFT, 0]);
    expect(g.release(50)).toEqual([]);
    g.grant([{ x: 500, y: 250 }], 150);
    const drag = pointers(g.move([{ x: 520, y: 250 }]));
    expect(drag[0][2]).toBe(LEFT);
    expect(pointers(g.end(0, 400))).toEqual([[drag[0][0], drag[0][1], 0]]);
    expect(g.release(400)).toEqual([]);
  });

  test("a drag lets go of the button once with end and release", () => {
    const g = new DisplayGestures(view());
    g.grant([{ x: 100, y: 100 }], 0);
    g.begin([{ x: 100, y: 100 }], 0);
    expect(pointers(g.move([{ x: 150, y: 100 }]))).toEqual([
      [200, 200, LEFT],
      [300, 200, LEFT],
    ]);
    expect(pointers(g.end(0, 500))).toEqual([[300, 200, 0]]);
    expect(g.release(500)).toEqual([]);
  });

  test("a drag whose end is missing lets go on release", () => {
    const g = new DisplayGestures(view());
    g.grant([{ x: 100, y: 100 }], 0);
    g.move([{ x: 150, y: 100 }]);
    expect(pointers(g.release(500))).toEqual([[300, 200, 0]]);
    expect(g.release(500)).toEqual([]);
  });

  test("a cancel during a drag lets go of the button without a click", () => {
    const g = new DisplayGestures(view());
    g.grant([{ x: 100, y: 100 }], 0);
    g.move([{ x: 150, y: 100 }]);
    expect(pointers(g.cancel())).toEqual([[300, 200, 0]]);
    expect(g.release(500)).toEqual([]);
    expect(g.cancel()).toEqual([]);
    expect(pointers(tap(g, { x: 100, y: 50 }, 1000))).toEqual([
      [200, 100, LEFT],
      [200, 100, 0],
    ]);
  });

  test("a cancel during a trackpad drag lets go of the button", () => {
    const g = new DisplayGestures(view(), "trackpad");
    tap(g, { x: 500, y: 250 }, 0);
    g.grant([{ x: 500, y: 250 }], 150);
    const drag = pointers(g.move([{ x: 520, y: 250 }]));
    expect(pointers(g.cancel())).toEqual([[drag[0][0], drag[0][1], 0]]);
  });

  test("a cancel of a tap or of two fingers sends nothing", () => {
    const g = new DisplayGestures(view());
    g.grant([{ x: 100, y: 50 }], 0);
    expect(g.cancel()).toEqual([]);
    g.grant([a], 100);
    g.begin([a, b], 110);
    expect(g.cancel()).toEqual([]);
    expect(g.release(150)).toEqual([]);
  });
});

describe("a second finger during a drag", () => {
  // Zoom 4 is scale 2: the desktop does not fit, two fingers pan.
  const zoomed = () => {
    const g = new DisplayGestures(view());
    g.setView(view({ zoom: 4, panX: 500, panY: 250 }));
    return g;
  };

  /** One finger drags (LEFT down), a second lands and the two pan. */
  function dragThenPan(g: DisplayGestures) {
    const out: GestureAction[] = [];
    out.push(...g.grant([{ x: 400, y: 250 }], 0));
    out.push(...g.begin([{ x: 400, y: 250 }], 0));
    out.push(...g.move([{ x: 450, y: 250 }]));
    const r = toRemote(g.view, 450, 250);
    const second = g.begin(
      [
        { x: 450, y: 250 },
        { x: 650, y: 250 },
      ],
      100,
    );
    // The button goes up right away, where the drag left it.
    expect(pointers(second)).toEqual([
      [Math.round(r.x), Math.round(r.y), g.held],
    ]);
    out.push(...second);
    const pan = g.move([
      { x: 350, y: 200 },
      { x: 550, y: 200 },
    ]);
    expect(pan.length).toBeGreaterThan(0);
    expect(pan.every((a) => a.kind === "view")).toBe(true);
    out.push(...pan);
    return out;
  }

  function expectLetGo(out: GestureAction[], held = 0) {
    const p = pointers(out);
    const down = p.findIndex((q) => (q[2] & LEFT) !== 0);
    const up = p.findIndex((q, i) => i > down && (q[2] & LEFT) === 0);
    expect(down).toBeGreaterThanOrEqual(0);
    expect(up).toBeGreaterThan(down);
    // Exactly one button-up, and it is the last pointer event.
    expect(p.filter((q) => (q[2] & LEFT) === 0)).toHaveLength(1);
    expect(p.at(-1)?.[2]).toBe(held);
  }

  test("a touch drag lets go when the second finger lands, then pans", () => {
    const g = zoomed();
    const out = dragThenPan(g);
    expect(g.end(1, 300)).toEqual([]);
    expect(g.release(300)).toEqual([]);
    expectLetGo(out);
    expect(g.view.panX).toBe(550);
  });

  test("a cancel after the pan sends no second button-up", () => {
    const g = zoomed();
    const out = dragThenPan(g);
    out.push(...g.cancel());
    out.push(...g.release(300));
    expectLetGo(out);
  });

  test("a trackpad tap then drag lets go when a second finger lands", () => {
    const g = new DisplayGestures(view(), "trackpad");
    tap(g, { x: 500, y: 250 }, 0);
    const out: GestureAction[] = [];
    out.push(...g.grant([{ x: 500, y: 250 }], 150));
    const drag = g.move([{ x: 520, y: 250 }]);
    expect(pointers(drag)[0][2]).toBe(LEFT);
    out.push(...drag);
    const second = g.begin(
      [
        { x: 520, y: 250 },
        { x: 620, y: 250 },
      ],
      200,
    );
    expect(pointers(second)).toEqual([
      [Math.round(g.cursor.x), Math.round(g.cursor.y), 0],
    ]);
    out.push(...second);
    out.push(
      ...g.move([
        { x: 522, y: 252 },
        { x: 622, y: 252 },
      ]),
    );
    out.push(...g.end(1, 400));
    out.push(...g.release(400));
    expectLetGo(out);
  });

  test("held bar buttons stay held when the drag button goes up", () => {
    const g = zoomed();
    g.held = RIGHT;
    const out = dragThenPan(g);
    out.push(...g.end(1, 300));
    out.push(...g.release(300));
    const p = pointers(out);
    expect(p[0][2]).toBe(LEFT | RIGHT);
    expectLetGo(out, RIGHT);
    expect(p.at(-1)?.[2]).toBe(RIGHT);
  });
});

test("a smaller view keeps the cursor inside the desktop", () => {
  const g = new DisplayGestures(view(), "trackpad");
  g.cursor = { x: 1999, y: 999 };
  g.setView(view({ remoteW: 800, remoteH: 600 }));
  expect(g.cursor).toEqual({ x: 799, y: 599 });
});
