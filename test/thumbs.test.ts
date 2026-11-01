import { describe, expect, it, vi } from "vitest";
import { thumbnail, thumbWidth } from "../worker/lib/thumbs";
import { photoUrl } from "../src/lib/photos";

describe("thumbWidth", () => {
  it("allows only the two sizes the app asks for", () => {
    expect(thumbWidth("320")).toBe(320);
    expect(thumbWidth("800")).toBe(800);
    expect(thumbWidth(undefined)).toBeNull();
    expect(thumbWidth("100")).toBeNull();
    expect(thumbWidth("320px")).toBeNull();
  });
});

describe("photoUrl", () => {
  it("asks for a small copy only where the photo shows small", () => {
    expect(photoUrl("abc")).toBe("/api/photos/abc");
    expect(photoUrl("abc", "small")).toBe("/api/photos/abc?w=320");
    expect(photoUrl("abc", "wide")).toBe("/api/photos/abc?w=800");
  });
});

describe("thumbnail", () => {
  const photo = () => Promise.resolve({ body: new ReadableStream() } as unknown as R2ObjectBody);

  it("gives up (so the full photo is served) when Images isn't bound", async () => {
    expect(await thumbnail(undefined, photo, "https://x/__thumbs/a/w320", 320, () => {})).toBeNull();
  });

  it("gives up when Images fails", async () => {
    const images = {
      input: () => ({ transform: () => ({ output: () => Promise.reject(new Error("9432")) }) }),
    } as unknown as ImagesBinding;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await thumbnail(images, photo, "https://x/__thumbs/a/w320", 320, () => {})).toBeNull();
  });

  it("serves the shrunk copy, kept privately by the browser", async () => {
    const transform = vi.fn();
    const images = {
      input: () => ({
        transform: (opts: unknown) => {
          transform(opts);
          return {
            output: () => Promise.resolve({ response: () => new Response("small", { headers: { "Content-Type": "image/webp" } }) }),
          };
        },
      }),
    } as unknown as ImagesBinding;
    const res = await thumbnail(images, photo, "https://x/__thumbs/a/w320", 320, () => {});
    expect(transform).toHaveBeenCalledWith({ width: 320, fit: "scale-down" });
    expect(res?.headers.get("Content-Type")).toBe("image/webp");
    expect(res?.headers.get("Cache-Control")).toContain("private");
    expect(await res?.text()).toBe("small");
  });
});
