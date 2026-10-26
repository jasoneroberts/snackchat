// The maths behind the photo cropper, kept apart from the screen so it can be
// tested. The photo sits behind a fixed frame; you move it and zoom it. The
// photo must always fill the frame, so there are never empty edges.

export interface View {
  zoom: number; // 1 = photo just fills the frame
  x: number; // photo's left edge, in frame pixels (0 or less)
  y: number; // photo's top edge, in frame pixels (0 or less)
}

export const MAX_ZOOM = 4;

/** How big the photo is drawn at zoom 1: just big enough to cover the frame. */
export const coverScale = (img: { w: number; h: number }, frame: { w: number; h: number }) =>
  Math.max(frame.w / img.w, frame.h / img.h);

/** Keep the zoom in range and the photo covering the frame. */
export function clampView(v: View, img: { w: number; h: number }, frame: { w: number; h: number }): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const s = coverScale(img, frame) * zoom;
  const minX = frame.w - img.w * s;
  const minY = frame.h - img.h * s;
  return { zoom, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

/** The view that shows the photo centred at zoom 1. */
export const centredView = (img: { w: number; h: number }, frame: { w: number; h: number }): View => {
  const s = coverScale(img, frame);
  return { zoom: 1, x: (frame.w - img.w * s) / 2, y: (frame.h - img.h * s) / 2 };
};

/** Zoom by a factor around a point in the frame (a pinch's middle, or the mouse), keeping that point still. */
export function zoomAt(v: View, factor: number, at: { x: number; y: number }, img: { w: number; h: number }, frame: { w: number; h: number }): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor));
  const ratio = zoom / v.zoom;
  return clampView({ zoom, x: at.x - (at.x - v.x) * ratio, y: at.y - (at.y - v.y) * ratio }, img, frame);
}

/** The part of the photo inside the frame, in the photo's own pixels. */
export function cropRect(v: View, img: { w: number; h: number }, frame: { w: number; h: number }) {
  const s = coverScale(img, frame) * v.zoom;
  const x = Math.max(0, -v.x / s);
  const y = Math.max(0, -v.y / s);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(img.w - x, frame.w / s)),
    height: Math.round(Math.min(img.h - y, frame.h / s)),
  };
}
