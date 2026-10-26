import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { centredView, clampView, coverScale, cropRect, MAX_ZOOM, type View, zoomAt } from "../lib/crop";
import { cropToJpeg, decode } from "../lib/image";

type Shape = "original" | "square";

/**
 * Full-screen photo cropper. Drag to move, pinch (or the slider, or the mouse
 * wheel) to zoom. Square-only for profile pictures; check-in photos can also
 * keep their original shape. Gives back a JPEG of just the framed part.
 */
export function Cropper({
  file,
  squareOnly = false,
  maxSide,
  onDone,
  onCancel,
}: {
  file: File;
  squareOnly?: boolean;
  maxSide?: number;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shape, setShape] = useState<Shape>(squareOnly ? "square" : "original");
  const [width, setWidth] = useState(0); // frame width in screen pixels
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  // Read the photo the right way up.
  useEffect(() => {
    let live = true;
    decode(file)
      .then((b) => {
        if (!live) return b?.close();
        if (!b) setError("This photo can't be cropped here, but you can still use it as it is.");
        setBitmap(b);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't read that photo."));
    return () => {
      live = false;
    };
  }, [file]);
  useEffect(() => () => bitmap?.close(), [bitmap]);

  // Esc cancels; the page behind doesn't scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onCancel]);

  // The frame fits the screen: as wide as it can be, and not taller than about 60% of it.
  useLayoutEffect(() => {
    // clientWidth includes the stage's 16px side padding.
    const measure = () => setWidth(Math.max(0, (box.current?.clientWidth ?? 0) - 32));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const img = bitmap ? { w: bitmap.width, h: bitmap.height } : null;
  const ratio = !img || shape === "square" ? 1 : img.h / img.w;
  const maxH = Math.round(window.innerHeight * 0.6);
  const frame = { w: Math.min(width, maxH / ratio), h: Math.min(width * ratio, maxH) };

  // Start centred whenever the photo, shape or size changes.
  useEffect(() => {
    if (img && frame.w > 0) setView(centredView(img, frame));
  }, [bitmap, shape, frame.w, frame.h]);

  // Draw the photo into the frame (sharp on high-density screens).
  useEffect(() => {
    const c = canvas.current;
    if (!c || !bitmap || !img || !view) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(frame.w * dpr);
    c.height = Math.round(frame.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = coverScale(img, frame) * view.zoom;
    ctx.drawImage(bitmap, view.x, view.y, img.w * s, img.h * s);
  }, [bitmap, view, frame.w, frame.h]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvas.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const map = pointers.current;
    const before = map.get(e.pointerId);
    if (!before || !img || !view) return;
    const now = local(e);
    if (map.size === 1) {
      // One finger: move the photo.
      setView(clampView({ ...view, x: view.x + now.x - before.x, y: view.y + now.y - before.y }, img, frame));
    } else if (map.size === 2) {
      // Two fingers: zoom around the point between them.
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1];
      const distBefore = Math.hypot(before.x - other.x, before.y - other.y);
      const distNow = Math.hypot(now.x - other.x, now.y - other.y);
      if (distBefore > 0) {
        setView(zoomAt(view, distNow / distBefore, { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 }, img, frame));
      }
    }
    map.set(e.pointerId, now);
  };

  const onPointerUp = (e: React.PointerEvent) => pointers.current.delete(e.pointerId);

  const onWheel = (e: React.WheelEvent) => {
    if (!img || !view) return;
    setView(zoomAt(view, e.deltaY < 0 ? 1.1 : 1 / 1.1, local(e), img, frame));
  };

  const setZoom = (zoom: number) => {
    if (!img || !view) return;
    setView(zoomAt(view, zoom / view.zoom, { x: frame.w / 2, y: frame.h / 2 }, img, frame));
  };

  const done = async () => {
    if (!bitmap || !img || !view) return onDone(file);
    setBusy(true);
    try {
      onDone(await cropToJpeg(bitmap, cropRect(view, img, frame), maxSide));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't crop that photo.");
      setBusy(false);
    }
  };

  return (
    <div className="cropper" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="cropper-top">
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
        <b>Crop photo</b>
        <button type="button" className="button small" disabled={busy || (!bitmap && !error)} onClick={done}>
          {busy ? "…" : "Use photo"}
        </button>
      </div>

      <div ref={box} className="cropper-stage">
        {error && !bitmap ? (
          <p className="cropper-note">{error}</p>
        ) : !bitmap ? (
          <p className="cropper-note">Loading…</p>
        ) : (
          <div className="cropper-frame" style={{ width: frame.w, height: frame.h }}>
            <canvas
              ref={canvas}
              style={{ width: frame.w, height: frame.h }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            />
            {/* Rule-of-thirds lines help line the snack up. */}
            <span className="cropper-grid" aria-hidden="true" />
          </div>
        )}
      </div>

      {bitmap && view && (
        <div className="cropper-controls">
          <label className="cropper-zoom">
            <span className="small">Zoom</span>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          {!squareOnly && (
            <div className="segmented small">
              {(["original", "square"] as Shape[]).map((s) => (
                <button key={s} type="button" className={shape === s ? "on" : ""} aria-pressed={shape === s} onClick={() => setShape(s)}>
                  {s === "original" ? "Original" : "Square"}
                </button>
              ))}
            </div>
          )}
          <p className="small cropper-hint">Drag to move. Pinch or use the slider to zoom.</p>
        </div>
      )}
    </div>
  );
}
