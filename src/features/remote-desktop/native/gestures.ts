// Touch to mouse for a remote desktop. Pure, so it can be
// tested without a phone; the tab feeds it touches and sends what it returns.
// Two fingers pinch to zoom, and drag to scroll the remote wheel while the
// whole desktop fits or to pan the view while zoomed in.
// React Native on Android can finish a gesture (end(0) or release) while a
// finger is still down. That leftover finger sends nothing, no press, drag or
// click, until a fresh touch-down starts a new gesture.
import {
  clampPan,
  fitScale,
  fitsInView,
  panBy,
  toRemote,
  zoomAround,
  type Viewport,
} from "@/features/remote-desktop/viewport";

export type PointerMode = "touch" | "trackpad";

export interface Point {
  x: number;
  y: number;
}

/** Buttons like Guacamole: 1 left, 2 middle, 4 right, 8 wheel up, 16 wheel down. */
export const LEFT = 1;
export const MIDDLE = 2;
export const RIGHT = 4;
export const WHEEL_UP = 8;
export const WHEEL_DOWN = 16;

export type GestureAction =
  | { kind: "pointer"; x: number; y: number; buttons: number }
  | { kind: "view"; view: Viewport };

export const TAP_MS = 300;
export const LONG_PRESS_MS = 500;
export const TAP_MOVE_PX = 8;
export const DOUBLE_TAP_MS = 300;
export const SCROLL_PX = 40;
export const PINCH_PX = 8;
/** Trackpad speed, in view points per finger point. */
export const TRACKPAD_SPEED = 1.8;
/** Touches that start this close to a side edge are left to the system back gesture. */
export const EDGE_PX = 16;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export class DisplayGestures {
  /** Buttons held from the button bar, added to every pointer event. */
  held = 0;
  /** The trackpad cursor, in remote pixels. */
  cursor: Point;

  private fingers = 0;
  private startAt = 0;
  private start: Point = { x: 0, y: 0 };
  private last: Point = { x: 0, y: 0 };
  private moved = false;
  private dragging = false;
  private ignored = false;
  private lastTapAt = -Infinity;
  private pinch: { d: number; view: Viewport; mid: Point } | null = null;
  private pinching = false;
  /** Two finger midpoint at gesture start, for the tap movement check. */
  private twoStart: Point = { x: 0, y: 0 };
  private scrollAcc = 0;
  private maxFingers = 0;
  /**
   * From the first finger down until the gesture is finished. Moves outside
   * it come from a finger left over from a finished gesture and are ignored.
   */
  private active = false;
  /**
   * Where the gesture's own drag button (LEFT) was last sent down, in remote
   * pixels, while it is held; null when it is up. Independent of the finger
   * count, so a second finger or the end can always let go of it.
   */
  private down: Point | null = null;

  constructor(
    public view: Viewport,
    public mode: PointerMode = "touch",
  ) {
    this.cursor = { x: view.remoteW / 2, y: view.remoteH / 2 };
  }

  setMode(mode: PointerMode) {
    this.mode = mode;
    this.cursor = { x: this.view.remoteW / 2, y: this.view.remoteH / 2 };
  }

  /** The view or framebuffer changed size: refit, keep the cursor inside. */
  setView(view: Viewport) {
    this.view = clampPan(view);
    this.cursor = this.clampCursor(this.cursor);
  }

  private clampCursor(p: Point): Point {
    return {
      x: Math.max(0, Math.min(this.view.remoteW - 1, p.x)),
      y: Math.max(0, Math.min(this.view.remoteH - 1, p.y)),
    };
  }

  private at(p: Point, buttons: number): GestureAction {
    return {
      kind: "pointer",
      x: Math.round(p.x),
      y: Math.round(p.y),
      buttons: buttons | this.held,
    };
  }

  private remote(p: Point): Point {
    return this.clampCursor(toRemote(this.view, p.x, p.y));
  }

  /** Where clicks land: under the finger, or at the trackpad cursor. */
  private target(p: Point): Point {
    return this.mode === "touch" ? this.remote(p) : this.cursor;
  }

  private click(p: Point, button: number): GestureAction[] {
    return [this.at(p, button), this.at(p, 0)];
  }

  /**
   * A new responder gesture starts clean, even if the last one lost its end.
   * `fresh` is false when a move claimed the responder, not a touch-down: the
   * finger was already down, left over from a finished gesture, so like an
   * edge touch it clicks and drags nothing until all fingers are up.
   */
  grant(touches: Point[], t: number, fresh = true): GestureAction[] {
    const out = [...this.cancel(), ...this.begin(touches, t)];
    if (!fresh) {
      this.ignored = true;
      this.dragging = false;
    }
    return out;
  }

  begin(touches: Point[], t: number): GestureAction[] {
    this.active = true;
    this.fingers = touches.length;
    this.maxFingers = Math.max(this.maxFingers, touches.length);
    if (touches.length === 1 && this.maxFingers === 1) {
      const [p] = touches;
      this.ignored = p.x < EDGE_PX || p.x > this.view.viewW - EDGE_PX;
      this.start = p;
      this.last = p;
      this.startAt = t;
      this.moved = false;
      // Tap then drag on the trackpad holds the left button.
      this.dragging =
        this.mode === "trackpad" && t - this.lastTapAt < DOUBLE_TAP_MS;
      return [];
    }
    // More fingers: let go of a drag button first, the rest is a normal
    // multi-finger gesture.
    const out = touches.length > 1 ? this.letGo() : [];
    if (touches.length === 2) {
      this.pinch = {
        d: dist(touches[0], touches[1]),
        view: this.view,
        mid: mid(touches[0], touches[1]),
      };
      this.pinching = false;
      this.scrollAcc = 0;
      this.twoStart = this.pinch.mid;
      this.last = this.pinch.mid;
    }
    return out;
  }

  move(touches: Point[]): GestureAction[] {
    // The gesture already finished with a finger still down: that finger
    // waits for a fresh touch-down (begin or grant) instead of dragging from
    // the old start.
    if (!this.active) return [];
    // A second finger whose start never came still lets go of a drag button,
    // and makes this a multi-finger gesture so the drag does not resume.
    this.maxFingers = Math.max(this.maxFingers, touches.length);
    const up = touches.length > 1 ? this.letGo() : [];
    if (touches.length >= 2 && this.pinch) {
      return [...up, ...this.twoFingers(touches)];
    }
    if (up.length) return up;
    if (touches.length !== 1 || this.maxFingers > 1 || this.ignored) return [];
    const [p] = touches;
    if (!this.moved && dist(p, this.start) <= TAP_MOVE_PX) return [];
    const first = !this.moved;
    this.moved = true;
    if (this.mode === "touch") {
      const r = this.remote(p);
      // Drag holds the left button from where the finger went down.
      const out = first ? [this.at(this.remote(this.start), LEFT)] : [];
      this.last = p;
      this.down = r;
      return [...out, this.at(r, LEFT)];
    }
    const scale = fitScale(this.view) * this.view.zoom;
    this.cursor = this.clampCursor({
      x: this.cursor.x + ((p.x - this.last.x) * TRACKPAD_SPEED) / scale,
      y: this.cursor.y + ((p.y - this.last.y) * TRACKPAD_SPEED) / scale,
    });
    this.last = p;
    if (this.dragging) this.down = this.cursor;
    return [this.at(this.cursor, this.dragging ? LEFT : 0)];
  }

  /**
   * A pinch (sticky once the finger distance changes by PINCH_PX) zooms
   * around the fingers. Otherwise a drag pans the view when zoomed in, or
   * scrolls the wheel when the whole desktop fits, decided per move.
   */
  private twoFingers(touches: Point[]): GestureAction[] {
    const pinch = this.pinch!;
    const m = mid(touches[0], touches[1]);
    const d = dist(touches[0], touches[1]);
    if (this.pinching || Math.abs(d - pinch.d) > PINCH_PX) {
      if (!this.pinching) {
        // Zoom around what is under the fingers now: a pan before the pinch
        // may have hit an edge. The distance baseline stays.
        pinch.view = this.view;
        pinch.mid = m;
      }
      this.pinching = true;
      this.moved = true;
      this.last = m;
      this.view = zoomAround(
        pinch.view,
        pinch.view.zoom * (d / pinch.d),
        pinch.mid.x,
        pinch.mid.y,
        m.x,
        m.y,
      );
      return [{ kind: "view", view: this.view }];
    }
    const dx = m.x - this.last.x;
    const dy = m.y - this.last.y;
    this.last = m;
    // Many tiny moves add up: past TAP_MOVE_PX from the start it is no tap.
    if (dist(m, this.twoStart) > TAP_MOVE_PX) this.moved = true;
    if (!fitsInView(this.view)) {
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) this.moved = true;
      this.scrollAcc = 0;
      this.view = panBy(this.view, dx, dy);
      return [{ kind: "view", view: this.view }];
    }
    if (Math.abs(dy) > 0.5) this.moved = true;
    this.scrollAcc += dy;
    if (Math.abs(this.scrollAcc) < SCROLL_PX) return [];
    const wheel = this.scrollAcc > 0 ? WHEEL_UP : WHEEL_DOWN;
    this.scrollAcc = 0;
    const at = this.target(m);
    return [this.at(at, wheel), this.at(at, 0)];
  }

  /** `remaining` is how many fingers are still down. */
  end(remaining: number, t: number): GestureAction[] {
    this.fingers = remaining;
    if (remaining > 0) return [];
    const out = [...this.letGo(), ...this.finish(t)];
    this.reset();
    return out;
  }

  /**
   * The responder let go. After two fingers React Native can skip the last
   * finger's end, so this finishes the gesture; nothing after end(0) did.
   */
  release(t: number): GestureAction[] {
    return this.active ? this.end(0, t) : [];
  }

  /** The responder was taken away: no click, but a held drag button goes up. */
  cancel(): GestureAction[] {
    const out = this.letGo();
    this.reset();
    return out;
  }

  private reset() {
    this.active = false;
    this.fingers = 0;
    this.maxFingers = 0;
    this.moved = false;
    this.dragging = false;
    this.ignored = false;
    this.pinch = null;
    this.pinching = false;
    this.down = null;
  }

  /** The button-up for the gesture's own drag button, once, if it is held. */
  private letGo(): GestureAction[] {
    const at = this.down;
    if (!at) return [];
    this.down = null;
    this.dragging = false;
    return [this.at(at, 0)];
  }

  private finish(t: number): GestureAction[] {
    const fingers = this.maxFingers;
    const quick = t - this.startAt < TAP_MS;
    if (fingers === 1) {
      // A drag already let go of its button in end().
      if (this.ignored || this.moved) return [];
      const at = this.target(this.start);
      if (this.mode === "touch" && t - this.startAt >= LONG_PRESS_MS) {
        return this.click(at, RIGHT);
      }
      if (!quick) return [];
      this.lastTapAt = t;
      return this.click(at, LEFT);
    }
    if (this.moved || !quick) return [];
    if (fingers === 2) return this.click(this.target(this.last), RIGHT);
    if (fingers === 3) return this.click(this.target(this.last), MIDDLE);
    return [];
  }
}
