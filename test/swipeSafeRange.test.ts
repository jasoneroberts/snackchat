import { describe, expect, it } from "vitest";
import { classifyGesture, valueFromX } from "../src/lib/swipeRange";

describe("valueFromX", () => {
  // A 220px-wide slider starting at x=0: the thumb centre runs from 10 to 210.
  it("maps the ends of the track to min and max", () => {
    expect(valueFromX(10, 0, 220, 0, 5)).toBe(0);
    expect(valueFromX(210, 0, 220, 0, 5)).toBe(5);
  });
  it("clamps fingers outside the track", () => {
    expect(valueFromX(-50, 0, 220, 0, 5)).toBe(0);
    expect(valueFromX(400, 0, 220, 0, 5)).toBe(5);
  });
  it("snaps to the nearest whole step", () => {
    expect(valueFromX(110, 0, 220, 0, 5)).toBe(3); // 2.5 rounds up
    expect(valueFromX(90, 0, 220, 0, 5)).toBe(2);
  });
  it("respects the slider's left edge", () => {
    expect(valueFromX(110, 100, 220, 0, 5)).toBe(0);
  });
});

describe("classifyGesture", () => {
  it("waits until the finger has moved a little", () => {
    expect(classifyGesture(3, 4)).toBe("undecided");
  });
  it("treats mostly-vertical swipes as scrolling", () => {
    expect(classifyGesture(8, 30)).toBe("scroll");
    expect(classifyGesture(0, -12)).toBe("scroll");
  });
  it("treats mostly-sideways moves as a drag", () => {
    expect(classifyGesture(25, 6)).toBe("drag");
    expect(classifyGesture(-15, 2)).toBe("drag");
  });
});
