import { useRef, type PointerEvent } from "react";
import { classifyGesture, valueFromX } from "../lib/swipeRange";

type Props = {
  id: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
};

/**
 * A range slider that ignores up/down swipes, so scrolling a long form with
 * your thumb doesn't set ratings on the way past.
 *
 * Phone browsers move a native slider the instant a finger touches it, before
 * they know whether you're scrolling. So the real <input> doesn't take touches
 * or clicks (pointer-events: none in CSS) and this wrapper reads the finger
 * itself: a tap or a clearly sideways drag sets the value; a vertical swipe is
 * left to the browser to scroll. Keyboards and screen readers still use the
 * real input as normal.
 */
export function SwipeSafeRange({ id, min, max, step = 1, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<{ x: number; y: number; state: "undecided" | "drag" | "scroll" } | null>(null);

  const setFromX = (clientX: number) => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = valueFromX(clientX, rect.left, rect.width, min, max, step);
    if (v !== value) onChange(v);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") {
      // A mouse can't scroll by dragging, so start dragging straight away.
      if (e.button !== 0) return;
      gesture.current = { x: e.clientX, y: e.clientY, state: "drag" };
      e.currentTarget.setPointerCapture(e.pointerId);
      inputRef.current?.focus();
      setFromX(e.clientX);
      return;
    }
    // Touch or pen: wait to see which way the finger goes.
    gesture.current = { x: e.clientX, y: e.clientY, state: "undecided" };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.state === "scroll") return;
    if (g.state === "undecided") {
      g.state = classifyGesture(e.clientX - g.x, e.clientY - g.y);
      if (g.state !== "drag") return;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setFromX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    // A tap that barely moved counts as "put the thumb here".
    if (g && g.state === "undecided") setFromX(e.clientX);
  };

  // The browser cancels the pointer when it takes the gesture over to scroll.
  const onPointerCancel = () => {
    gesture.current = null;
  };

  return (
    <div
      className="swipe-range"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <input
        ref={inputRef}
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
