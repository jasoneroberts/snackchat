// Phone photos are often 3 to 12 MB. Shrinking them in the browser before
// upload makes posting quick on mobile data and keeps R2 storage small.

const MAX_SIDE = 1600;
const QUALITY = 0.85;
const SERVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SERVER_MAX_BYTES = 5 * 1024 * 1024;

/** A JPEG no bigger than 1600px on its longest side, upright. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the phone's rotation tag, so photos aren't sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // The browser can't decode it (some HEIC files outside Safari). Send it
    // untouched if the server will accept it.
    if (SERVER_TYPES.includes(file.type) && file.size <= SERVER_MAX_BYTES) return file;
    throw new Error("Couldn't read that photo. Try a JPEG or PNG.");
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo."))), "image/jpeg", QUALITY),
  );
}
