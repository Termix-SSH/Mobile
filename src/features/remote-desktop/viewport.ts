/**
 * Fit, zoom and pan math for a remote framebuffer. The server owns the
 * framebuffer size (fixed size VNC especially), the view only scales it.
 * Zoom is relative to fit to screen: 1 shows the whole desktop, values down
 * to MIN_ZOOM shrink it further and values up to MAX_ZOOM magnify it.
 * Pan is anchored top left and is 0 on any axis where the desktop fits.
 */
export interface Viewport {
  /** View size in points. */
  viewW: number;
  viewH: number;
  /** Framebuffer size in remote pixels. */
  remoteW: number;
  remoteH: number;
  zoom: number;
  /** Top left corner of the view, in remote pixels. */
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export function fitScale(v: Viewport): number {
  return Math.min(v.viewW / v.remoteW, v.viewH / v.remoteH);
}

export function toRemote(v: Viewport, x: number, y: number) {
  const scale = fitScale(v) * v.zoom;
  return { x: v.panX + x / scale, y: v.panY + y / scale };
}

/**
 * Keeps the view inside the desktop. When the scaled desktop is smaller than
 * the view on an axis the upper bound is negative, so the outer max pins the
 * pan to 0 and the desktop stays anchored top left.
 */
export function clampPan(v: Viewport): Viewport {
  const scale = fitScale(v) * v.zoom;
  return {
    ...v,
    panX: Math.max(0, Math.min(v.remoteW - v.viewW / scale, v.panX)),
    panY: Math.max(0, Math.min(v.remoteH - v.viewH / scale, v.panY)),
  };
}

/** Zooms so the remote point under (fromX, fromY) at `from` ends up under (x, y). */
export function zoomAround(
  from: Viewport,
  zoom: number,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
): Viewport {
  const fixed = toRemote(from, fromX, fromY);
  const next = {
    ...from,
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
  };
  const scale = fitScale(next) * next.zoom;
  return clampPan({
    ...next,
    panX: fixed.x - x / scale,
    panY: fixed.y - y / scale,
  });
}

/** True when the whole desktop is visible at the current scale. */
export function fitsInView(v: Viewport): boolean {
  const scale = fitScale(v) * v.zoom;
  return (
    scale * v.remoteW <= v.viewW + 0.5 && scale * v.remoteH <= v.viewH + 0.5
  );
}

/**
 * Moves the view by a finger drag of (dx, dy) view points. The content follows
 * the fingers, so dragging left (negative dx) reveals more to the right.
 */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  const scale = fitScale(v) * v.zoom;
  return clampPan({
    ...v,
    panX: v.panX - dx / scale,
    panY: v.panY - dy / scale,
  });
}

/**
 * The same math for the WebView page, which can't import modules. It reads
 * and writes the page's remoteW, remoteH, zoom, panX and panY and uses
 * window size as the view. Kept in step with the functions above by a test.
 */
export const VIEWPORT_SCRIPT = `
      const MIN_ZOOM = ${MIN_ZOOM};
      const MAX_ZOOM = ${MAX_ZOOM};
      const vpW = () => window.innerWidth;
      const vpH = () => window.innerHeight;
      const fitScale = () => Math.min(vpW() / remoteW, vpH() / remoteH);
      const toRemote = (vx, vy) => ({
        x: panX + vx / (fitScale() * zoom),
        y: panY + vy / (fitScale() * zoom),
      });
      const clampPan = () => {
        const scale = fitScale() * zoom;
        panX = Math.max(0, Math.min(remoteW - vpW() / scale, panX));
        panY = Math.max(0, Math.min(remoteH - vpH() / scale, panY));
      };
      const fitsInView = () => {
        const scale = fitScale() * zoom;
        return scale * remoteW <= vpW() + 0.5 && scale * remoteH <= vpH() + 0.5;
      };
      const panBy = (dx, dy) => {
        const scale = fitScale() * zoom;
        panX -= dx / scale;
        panY -= dy / scale;
        clampPan();
      };
`;
