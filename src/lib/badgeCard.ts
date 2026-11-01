// The picture people share when they earn a badge: "I earned Crisp
// Connoisseur on Crunchd", the badge as a big medal, how to get it, and
// getcrunchd.com. Same size and style as the check-in picture (shareCard.ts),
// drawn on the phone.

import type { BadgeState } from "../../shared/achievements";
import { CREAM, FONT, H, INK, MUTED, ORANGE, ORANGE_DARK, W, loadImage, roundRect } from "./shareCard";
import { wrap } from "./textWrap";

/** The site header used on every share picture: icon plus "crunchd". */
export function drawHeader(ctx: CanvasRenderingContext2D, icon: HTMLImageElement | null) {
  ctx.textAlign = "left";
  ctx.font = `900 84px ${FONT}`;
  const word = "crunchd";
  const iconSize = 110;
  const headX = (W - (iconSize + 24 + ctx.measureText(word).width)) / 2;
  if (icon) {
    ctx.save();
    roundRect(ctx, headX, 110, iconSize, iconSize, 26);
    ctx.clip();
    ctx.drawImage(icon, headX, 110, iconSize, iconSize);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.fillText(word, headX + iconSize + 24, 192);
}

/** Orange, a little darker at the bottom, like the check-in picture. */
export function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, ORANGE);
  bg.addColorStop(1, "#e07a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

/** The white card in the middle, with a soft shadow. */
export function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgb(43 29 14 / 0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, w, h, 48);
  ctx.fill();
  ctx.restore();
}

export function drawFooter(ctx: CanvasRenderingContext2D, line: string, site: string) {
  const footerTop = H - 250;
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(line, W / 2, footerTop + 70);
  ctx.font = `900 76px ${FONT}`;
  ctx.fillText(site, W / 2, footerTop + 160);
}

export const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture"))), "image/jpeg", 0.9),
  );

export async function newCanvas(): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; icon: HTMLImageElement | null }> {
  // Wait for the font, or the canvas quietly falls back to a system one.
  await Promise.all(["900 80px Nunito", "800 40px Nunito", "700 40px Nunito"].map((f) => document.fonts.load(f))).catch(() => {});
  const icon = await loadImage("/icon-512.png");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx, icon };
}

export async function makeBadgeCard(input: { badge: BadgeState; username: string; site: string; heading: string }): Promise<Blob> {
  const { canvas, ctx, icon } = await newCanvas();
  drawBackground(ctx);
  drawHeader(ctx, icon);

  const cardX = 90;
  const cardW = W - cardX * 2;
  const cardY = 330;
  const cardH = 1240;
  drawCard(ctx, cardX, cardY, cardW, cardH);
  const mid = W / 2;
  ctx.textAlign = "center";

  ctx.fillStyle = MUTED;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(input.heading, mid, cardY + 110);

  // The medal: a ribbon, a gold ring, a cream face and the badge's emoji.
  const cy = cardY + 470;
  const r = 250;
  ctx.fillStyle = ORANGE_DARK;
  ctx.beginPath();
  ctx.moveTo(mid - 150, cy - r - 60);
  ctx.lineTo(mid - 40, cy - r + 60);
  ctx.lineTo(mid + 40, cy - r + 60);
  ctx.lineTo(mid + 150, cy - r - 60);
  ctx.closePath();
  ctx.fill();
  const ring = ctx.createLinearGradient(mid - r, cy - r, mid + r, cy + r);
  ring.addColorStop(0, "#ffd36b");
  ring.addColorStop(1, "#e59a1c");
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(mid, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(mid, cy, r - 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.font = `260px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(input.badge.emoji, mid, cy + 12);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = INK;
  ctx.font = `900 92px ${FONT}`;
  let y = cy + r + 140;
  for (const l of wrap(ctx, input.badge.name, cardW - 120, 2)) {
    ctx.fillText(l, mid, y);
    y += 100;
  }
  ctx.fillStyle = MUTED;
  ctx.font = `700 46px ${FONT}`;
  for (const l of wrap(ctx, input.badge.description, cardW - 140, 2)) {
    ctx.fillText(l, mid, y + 4);
    y += 58;
  }
  ctx.font = `800 38px ${FONT}`;
  ctx.fillText(input.username, mid, cardY + cardH - 60);

  drawFooter(ctx, "Can you get it?", input.site);
  return toJpeg(canvas);
}
