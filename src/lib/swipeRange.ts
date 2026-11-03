// Maths for SwipeSafeRange: kept out of the component so it can be unit tested.

// How far a finger has to move (in CSS pixels) before we decide whether the
// gesture is a sideways drag (move the slider) or an up/down swipe (scroll).
export const DRAG_DECIDE_PX = 10;
// Roughly the width of the browser's slider thumb. The thumb's centre can only
// travel from half a thumb in from the left edge to half a thumb in from the
// right, so we map finger positions onto that shorter track.
const THUMB_PX = 20;

/** Which slider value a finger at clientX lands on, snapped to whole steps. */
export function valueFromX(clientX: number, left: number, width: number, min: number, max: number, step = 1): number {
  const track = Math.max(1, width - THUMB_PX);
  const ratio = Math.min(1, Math.max(0, (clientX - left - THUMB_PX / 2) / track));
  const raw = min + ratio * (max - min);
  return Math.min(max, Math.max(min, Math.round((raw - min) / step) * step + min));
}

/** What a touch gesture is so far: still deciding, a sideways drag, or a scroll. */
export function classifyGesture(dx: number, dy: number): "undecided" | "drag" | "scroll" {
  if (Math.abs(dx) < DRAG_DECIDE_PX && Math.abs(dy) < DRAG_DECIDE_PX) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "drag" : "scroll";
}
