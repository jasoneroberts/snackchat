import { describe, expect, it } from "vitest";
import { centredView, clampView, cropRect, MAX_ZOOM, zoomAt } from "../src/lib/crop";
import { minRatingsFor } from "../worker/lib/boards";

const img = { w: 4000, h: 3000 }; // a landscape phone photo
const square = { w: 300, h: 300 };

describe("photo cropper maths", () => {
  it("starts centred, cutting the middle square out of a landscape photo", () => {
    const v = centredView(img, square);
    expect(cropRect(v, img, square)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
  });

  it("keeps the photo covering the frame however far it's dragged", () => {
    const v = clampView({ zoom: 1, x: 500, y: -900 }, img, square);
    expect(v.x).toBe(0); // can't pull the photo's left edge into the frame
    expect(v.y).toBe(0); // no room to move up or down at zoom 1
    expect(cropRect(clampView({ zoom: 1, x: -9999, y: 0 }, img, square), img, square).x).toBe(1000);
  });

  it("zooms around the pinch point and stops at the limits", () => {
    const v = zoomAt(centredView(img, square), 2, { x: 150, y: 150 }, img, square);
    expect(v.zoom).toBe(2);
    // Zoomed 2x on the middle: half the width and height, still centred.
    expect(cropRect(v, img, square)).toEqual({ x: 1250, y: 750, width: 1500, height: 1500 });
    expect(zoomAt(v, 100, { x: 0, y: 0 }, img, square).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v, 0.01, { x: 0, y: 0 }, img, square).zoom).toBe(1);
  });

  it("keeps the whole photo when the frame is its own shape and nothing is moved", () => {
    const original = { w: 320, h: 240 };
    expect(cropRect(centredView(img, original), img, original)).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
  });
});

describe("snack board minimum ratings", () => {
  it("is 3 for this month and all time, none for this week", () => {
    expect(minRatingsFor("week")).toBe(1);
    expect(minRatingsFor("month")).toBe(3);
    expect(minRatingsFor("all")).toBe(3);
  });
});
