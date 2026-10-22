// Phone photos are often 3 to 12 MB. Shrinking them in the browser before
// upload makes posting quick on mobile data and keeps R2 storage small.

const MAX_SIDE = 1600;
const AVATAR_SIDE = 400;
const QUALITY = 0.85;
const SERVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SERVER_MAX_BYTES = 5 * 1024 * 1024;

/** A JPEG no bigger than 1600px on its longest side, upright. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await decode(file);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return toJpeg(canvas);
}

/** A square JPEG for a profile picture, cut from the middle of the photo. */
export async function squareAvatar(file: File): Promise<Blob> {
  const bitmap = await decode(file);
  if (!bitmap) return file;

  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(AVATAR_SIDE, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  return toJpeg(canvas);
}

/**
 * Decode a photo the right way up. Returns null when the browser can't read
 * it (some HEIC files outside Safari) but the server will take it as it is.
 */
async function decode(file: File): Promise<ImageBitmap | null> {
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
