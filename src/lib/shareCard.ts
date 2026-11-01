// The picture people share after a check-in: "I rated Scampi Fries 4.5 on
// Crunchd", their photo (or the maker's logo), the stars and getcrunchd.com.
// Drawn on a canvas in the phone itself, so nothing is uploaded to make it.
// 1080 × 1920 is the shape of an Instagram or WhatsApp Story; it also sends
// fine as a normal picture in a chat.

import { wrap } from "./textWrap";

export interface ShareCardInput {
  snackName: string;
  brand: string | null;
  rating: number; // 0.25 to 5
  username: string;
  review: string | null;
  /** Their own photo, or a URL for the snack's photo or maker logo. */
  picture: { blob: Blob } | { url: string; logo: boolean } | null;
  site: string; // "getcrunchd.com"
}

// Shared with the badge and Crisp of the Week pictures (badgeCard.ts, battleCard.ts).
export const W = 1080;
export const H = 1920;
export const ORANGE = "#f28c28";
export const ORANGE_DARK = "#9a4a06";
export const INK = "#2b1d0e";
export const MUTED = "#6b5640";
export const CREAM = "#fff4e0";
export const FONT = "Nunito, system-ui, sans-serif";

/** Draws the card and gives it back as a JPEG, ready for navigator.share. */
export async function makeShareCard(input: ShareCardInput): Promise<Blob> {
  // The page loads Nunito (self-hosted, see styles.css); make sure the weights are ready
  // before drawing, or the canvas quietly falls back to a system font.
  await Promise.all(["900 80px Nunito", "800 40px Nunito", "700 40px Nunito"].map((f) => document.fonts.load(f))).catch(() => {});
  const [picture, icon] = await Promise.all([loadPicture(input.picture), loadImage("/icon-512.png")]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // Background: the app's orange, a little darker at the bottom.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, ORANGE);
  bg.addColorStop(1, "#e07a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Logo and name at the top.
  ctx.textAlign = "left";
  ctx.font = `900 84px ${FONT}`;
  const word = "crunchd";
  const iconSize = 110;
  const headWidth = iconSize + 24 + ctx.measureText(word).width;
  const headX = (W - headWidth) / 2;
  if (icon) {
    ctx.save();
    roundRect(ctx, headX, 110, iconSize, iconSize, 26);
    ctx.clip();
    ctx.drawImage(icon, headX, 110, iconSize, iconSize);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.fillText(word, headX + iconSize + 24, 192);

  // Work out the white card's contents first, so it can be centred.
  const cardX = 90;
  const cardW = W - cardX * 2;
  const inner = cardW - 120; // 60px padding each side
  ctx.font = `900 88px ${FONT}`;
  const nameLines = wrap(ctx, input.snackName, inner, 2);
  ctx.font = `italic 700 44px ${FONT}`;
  const reviewLines = input.review ? wrap(ctx, `“${input.review.trim()}”`, inner, 3) : [];
  let height = 60; // top padding
  height += 50; // "I rated"
  height += 20 + nameLines.length * 100;
  if (input.brand) height += 56;
  height += 40 + 110; // stars
  if (reviewLines.length) height += 40 + reviewLines.length * 58;
  height += 40 + 44; // "username"
  height += 60; // bottom padding

  // The picture takes whatever room the words leave between the logo and the address.
  const footerTop = H - 250;
  const room = footerTop - 290 - 30;
  const pictureSize = picture ? Math.max(320, Math.min(720, room - height - 56)) : 0;
  if (picture) height += pictureSize + 56;

  const cardY = Math.max(290, 270 + (footerTop - 270 - height) / 2);
  ctx.save();
  ctx.shadowColor = "rgb(43 29 14 / 0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fff";
  roundRect(ctx, cardX, cardY, cardW, height, 48);
  ctx.fill();
  ctx.restore();

  let y = cardY + 60;
  ctx.textAlign = "center";
  const mid = W / 2;

  if (picture) {
    const px = (W - pictureSize) / 2;
    ctx.save();
    roundRect(ctx, px, y, pictureSize, pictureSize, 36);
    ctx.clip();
    if (picture.logo) {
      // Logos sit whole on a cream square; photos fill it, cropped to fit.
      ctx.fillStyle = CREAM;
      ctx.fillRect(px, y, pictureSize, pictureSize);
      drawFit(ctx, picture.image, px + 80, y + 80, pictureSize - 160, "contain");
    } else {
      drawFit(ctx, picture.image, px, y, pictureSize, "cover");
    }
    ctx.restore();
    y += pictureSize + 56;
  }

  ctx.fillStyle = MUTED;
  ctx.font = `800 40px ${FONT}`;
  y += 40;
  ctx.fillText("I rated", mid, y);
  y += 10;

  ctx.fillStyle = INK;
  ctx.font = `900 88px ${FONT}`;
  for (const l of nameLines) {
    y += 100;
    ctx.fillText(l, mid, y - 10);
  }
  y += 20;
  if (input.brand) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 42px ${FONT}`;
    y += 46;
    ctx.fillText(input.brand, mid, y);
    y += 10;
  }

  // Five stars, filled to the rating, then the number.
  y += 40;
  ctx.font = `900 100px ${FONT}`;
  const score = String(Math.round(input.rating * 100) / 100);
  const star = 96;
  const gap = 10;
  const scoreW = ctx.measureText(score).width;
  const rowW = star * 5 + gap * 4 + 36 + scoreW;
  let sx = (W - rowW) / 2;
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, sx, y, star, Math.max(0, Math.min(1, input.rating - i)));
    sx += star + gap;
  }
  ctx.textAlign = "left";
  ctx.fillStyle = ORANGE_DARK;
  ctx.fillText(score, sx + 26, y + 88);
  ctx.textAlign = "center";
  y += 110;

  if (reviewLines.length) {
    y += 40;
    ctx.fillStyle = INK;
    ctx.font = `italic 700 44px ${FONT}`;
    for (const l of reviewLines) {
      y += 58;
      ctx.fillText(l, mid, y - 12);
    }
  }

  y += 40 + 34;
  ctx.fillStyle = MUTED;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(input.username, mid, y);

  // The address at the bottom, so anyone seeing it knows where to go.
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("What would you give it?", mid, footerTop + 70);
  ctx.font = `900 76px ${FONT}`;
  ctx.fillText(input.site, mid, footerTop + 160);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture"))), "image/jpeg", 0.9),
  );
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A five-point star in a size × size box, filled from the left by `fill` (0 to 1), like the app's stars. */
export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: number) {
  const cx = x + size / 2;
  const cy = y + size / 2 + size * 0.04;
  const outer = size / 2;
  const innerR = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = "#f3e6d2";
  ctx.fill();
  if (fill > 0) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = ORANGE;
    ctx.fillRect(x, y, size * fill, size);
    ctx.restore();
  }
}

/** Draws an image into a square, either filling it (cropping the edges) or fitting inside it. */
export function drawFit(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, size: number, mode: "cover" | "contain") {
  const scale = mode === "cover" ? Math.max(size / img.width, size / img.height) : Math.min(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

export type Picture = { image: ImageBitmap | HTMLImageElement; logo: boolean };

export async function loadPicture(p: ShareCardInput["picture"]): Promise<Picture | null> {
  try {
    if (!p) return null;
    if ("blob" in p) return { image: await createImageBitmap(p.blob), logo: false };
    const res = await fetch(p.url);
    if (!res.ok) return null;
    return { image: await createImageBitmap(await res.blob()), logo: p.logo };
  } catch {
    return null; // no picture is better than no card
  }
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
