// Phone photos are often 3 to 12 MB. Shrinking them in the browser before
// upload makes posting quick on mobile data and keeps R2 storage small.

const MAX_SIDE = 1600;
export const AVATAR_SIDE = 400;
const LOGO_SIDE = 256;
const QUALITY = 0.85;
const SERVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SERVER_MAX_BYTES = 5 * 1024 * 1024;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cut one part out of a photo (in the photo's own pixels) as an upright JPEG
 * no bigger than maxSide (1600px for check-ins, 400px for profile pictures).
 */
export function cropToJpeg(bitmap: ImageBitmap, rect: CropRect, maxSide = MAX_SIDE): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(rect.width, rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas);
}

/** A PNG logo no bigger than 256px on its longest side; PNG keeps a transparent background. */
export async function shrinkLogo(file: File): Promise<Blob> {
  const bitmap = await decode(file);
  if (!bitmap) return file;

  const scale = Math.min(1, LOGO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that image."))), "image/png"),
  );
}

/**
 * Decode a photo the right way up. Returns null when the browser can't read
 * it (some HEIC files outside Safari) but the server will take it as it is.
 */
export async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    // "from-image" applies the phone's rotation tag, so photos aren't sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (SERVER_TYPES.includes(file.type) && file.size <= SERVER_MAX_BYTES) return null;
    throw new Error("Couldn't read that photo. Try a JPEG or PNG.");
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo."))), "image/jpeg", QUALITY),
  );
}
