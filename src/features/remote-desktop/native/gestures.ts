// Touch to mouse for a remote desktop. Pure, so it can be
// tested without a phone; the tab feeds it touches and sends what it returns.
import {
  clampPan,
  fitScale,
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
  private scrollAcc = 0;
  private maxFingers = 0;

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

  begin(touches: Point[], t: number): GestureAction[] {
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
    if (touches.length === 2) {
      this.pinch = {
        d: dist(touches[0], touches[1]),
        view: this.view,
        mid: mid(touches[0], touches[1]),
      };
      this.pinching = false;
      this.scrollAcc = 0;
      this.last = this.pinch.mid;
    }
    return [];
  }

  move(touches: Point[]): GestureAction[] {
    if (touches.length >= 2 && this.pinch) return this.twoFingers(touches);
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
      return [...out, this.at(r, LEFT)];
    }
    const scale = fitScale(this.view) * this.view.zoom;
    this.cursor = this.clampCursor({
      x: this.cursor.x + ((p.x - this.last.x) * TRACKPAD_SPEED) / scale,
      y: this.cursor.y + ((p.y - this.last.y) * TRACKPAD_SPEED) / scale,
    });
    this.last = p;
    return [this.at(this.cursor, this.dragging ? LEFT : 0)];
  }

  private twoFingers(touches: Point[]): GestureAction[] {
    const pinch = this.pinch!;
    const m = mid(touches[0], touches[1]);
    const d = dist(touches[0], touches[1]);
    if (this.pinching || Math.abs(d - pinch.d) > PINCH_PX) {
      this.pinching = true;
      this.moved = true;
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
    const dy = m.y - this.last.y;
    this.last = m;
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
    const fingers = this.maxFingers;
    this.maxFingers = 0;
    this.pinch = null;
    const quick = t - this.startAt < TAP_MS;
    if (fingers === 1) {
      if (this.ignored) return [];
      if (this.moved) {
        const wasDragging = this.dragging;
        this.dragging = false;
        if (this.mode === "touch") return [this.at(this.remote(this.last), 0)];
        return wasDragging ? [this.at(this.cursor, 0)] : [];
      }
      const at = this.target(this.start);
      if (this.mode === "touch" && t - this.startAt >= LONG_PRESS_MS) {
        return this.click(at, RIGHT);
      }
      if (!quick) return [];
      this.lastTapAt = t;
      this.dragging = false;
      return this.click(at, LEFT);
    }
    if (this.moved || !quick) return [];
    if (fingers === 2) return this.click(this.target(this.last), RIGHT);
    if (fingers === 3) return this.click(this.target(this.last), MIDDLE);
    return [];
  }
}
