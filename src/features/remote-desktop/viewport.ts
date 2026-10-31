/**
 * Fit, zoom and pan math for a remote framebuffer. The server owns the
 * framebuffer size (fixed size VNC especially), the view only scales it.
 * Zoom is relative to fit to screen, so 1 always shows the whole desktop.
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

export const MAX_ZOOM = 8;

export function fitScale(v: Viewport): number {
  return Math.min(v.viewW / v.remoteW, v.viewH / v.remoteH);
}

export function toRemote(v: Viewport, x: number, y: number) {
  const scale = fitScale(v) * v.zoom;
  return { x: v.panX + x / scale, y: v.panY + y / scale };
}

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
  const next = { ...from, zoom: Math.max(1, Math.min(MAX_ZOOM, zoom)) };
  const scale = fitScale(next) * next.zoom;
  return clampPan({
    ...next,
    panX: fixed.x - x / scale,
    panY: fixed.y - y / scale,
  });
}

/**
 * The same math for the WebView page, which can't import modules. It reads
 * and writes the page's remoteW, remoteH, zoom, panX and panY and uses
 * window size as the view. Kept in step with the functions above by a test.
 */
export const VIEWPORT_SCRIPT = `
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
`;
