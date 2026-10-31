// Drawing for Wing It. Everything is painted with plain canvas calls (no image
// files), so the game adds only a few kilobytes and stays sharp on any screen.
// The canvas is scaled so that 1 unit here = 1 world unit (see CrispGame.tsx).

import { CRISP_R, FLOOR_Y, WORLD_H, crispX, shapes, type Game, type Obstacle, type Pickup } from "./wingIt";

const GOLD = "#f6c445";
const GOLD_DEEP = "#d9901a";
const GOLD_EDGE = "#a8630c";

/**
 * The crisp with wings. Its own little drawing so the flying Golden Crisp on the
 * feed and the one in the game look the same.
 *  t: seconds, drives the wing flap. tilt: radians, nose up is negative.
 */
export function drawCrisp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  { tilt = 0, flapRate = 9, glow = false, alpha = 1 }: { tilt?: number; flapRate?: number; glow?: boolean; alpha?: number } = {},
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const flap = Math.sin(t * flapRate); // -1 (down) .. 1 (up)

  if (glow) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    g.addColorStop(0, "rgb(255 236 150 / 0.9)");
    g.addColorStop(1, "rgb(255 236 150 / 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Back wing first (behind the crisp), then the body, then the front wing.
  wing(ctx, -2, -8, flap, 0.8, "rgb(255 255 255 / 0.75)");

  // Body: a wobbly oval, like a real crisp is never quite round.
  ctx.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + Math.sin(a * 5) * 0.06 + Math.cos(a * 3) * 0.05;
    const px = Math.cos(a) * 21 * wob;
    const py = Math.sin(a) * 15 * wob;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const body = ctx.createLinearGradient(-18, -14, 16, 16);
  body.addColorStop(0, "#ffe58a");
  body.addColorStop(0.55, GOLD);
  body.addColorStop(1, GOLD_DEEP);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD_EDGE;
  ctx.stroke();

  // Ridges: a few curved lines across, so it reads as a crinkle-cut.
  ctx.strokeStyle = "rgb(168 99 12 / 0.45)";
  ctx.lineWidth = 1.6;
  for (const off of [-9, -2, 5, 12]) {
    ctx.beginPath();
    ctx.moveTo(off - 4, -12);
    ctx.quadraticCurveTo(off + 2, 0, off - 4, 12);
    ctx.stroke();
  }
  // Salt specks.
  ctx.fillStyle = "rgb(255 255 255 / 0.85)";
  for (const [sx, sy] of [[-11, -4], [-4, 6], [3, -7], [10, 3], [-14, 5], [7, 9]]) {
    ctx.fillRect(sx, sy, 1.8, 1.8);
  }
  // Eye and a cheeky grin, facing right (the way it flies).
  ctx.fillStyle = "#2b1d0e";
  ctx.beginPath();
  ctx.arc(11, -4, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(11.4, -5.6, 1.1, 1.1);
  ctx.strokeStyle = "#2b1d0e";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(10, 2, 4.5, 0.2, Math.PI * 0.8);
  ctx.stroke();

  wing(ctx, 0, -10, flap, 1, "#ffffff");
  ctx.restore();
}

/** A feathery wing rooted at (x, y), swung up or down by `flap`. */
function wing(ctx: CanvasRenderingContext2D, x: number, y: number, flap: number, size: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 - flap * 0.75);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-6, -14, -22, -22, -30, -14);
  // Three scallops for feathers along the trailing edge.
  ctx.quadraticCurveTo(-26, -10, -24, -6);
  ctx.quadraticCurveTo(-18, -6, -16, -2);
  ctx.quadraticCurveTo(-9, -3, -6, 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgb(168 120 60 / 0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** The whole game frame. */
export function drawGame(ctx: CanvasRenderingContext2D, g: Game, holding: boolean) {
  const w = g.w;

  // Pub wall: dark warm wood, with soft lamp glows that drift slower than the
  // bar (parallax), so it feels like you're moving through a room.
  const wall = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  wall.addColorStop(0, "#2a1608");
  wall.addColorStop(1, "#4a2a10");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, FLOOR_Y);

  // Wood panelling lines.
  ctx.strokeStyle = "rgb(0 0 0 / 0.18)";
  ctx.lineWidth = 2;
  const panel = 120;
  const off = -((g.distance * 0.3) % panel);
  for (let x = off; x < w + panel; x += panel) {
    ctx.beginPath();
    ctx.moveTo(x, 210);
    ctx.lineTo(x, FLOOR_Y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 210);
  ctx.lineTo(w, 210);
  ctx.stroke();

  // Lamps.
  const lampGap = 230;
  const lampOff = -((g.distance * 0.15) % lampGap);
  for (let x = lampOff; x < w + lampGap; x += lampGap) {
    const glow = ctx.createRadialGradient(x + 60, 120, 2, x + 60, 120, 90);
    glow.addColorStop(0, "rgb(255 200 110 / 0.55)");
    glow.addColorStop(1, "rgb(255 200 110 / 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 40, 20, 200, 200);
    ctx.fillStyle = "#ffd98a";
    ctx.beginPath();
    ctx.arc(x + 60, 120, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pickups behind the obstacles so a crumb never hides a pint.
  for (const p of g.pickups) drawPickup(ctx, p, g.t);
  for (const o of g.obstacles) drawObstacle(ctx, o);

  // The bar counter.
  const bar = ctx.createLinearGradient(0, FLOOR_Y, 0, WORLD_H);
  bar.addColorStop(0, "#8a4f1d");
  bar.addColorStop(0.12, "#6b3a12");
  bar.addColorStop(1, "#3c1f08");
  ctx.fillStyle = bar;
  ctx.fillRect(0, FLOOR_Y, w, WORLD_H - FLOOR_Y);
  ctx.fillStyle = "rgb(255 220 170 / 0.35)";
  ctx.fillRect(0, FLOOR_Y, w, 3);
  // Beer mats sliding past, so you can see your speed.
  const matGap = 170;
  const matOff = -(g.distance % matGap);
  for (let x = matOff; x < w + matGap; x += matGap) {
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.ellipse(x + 40, FLOOR_Y + 10, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The crisp, tilted with its speed: nose up when climbing.
  const cx = crispX(g);
  const tilt = Math.max(-0.5, Math.min(0.6, g.vy / 700));
  const flashing = g.grace > 0 && Math.floor(g.grace * 10) % 2 === 0;
  if (g.salted) {
    // A sparkly ring while the salt is protecting you.
    ctx.strokeStyle = "rgb(255 255 255 / 0.7)";
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, g.y, CRISP_R + 12, g.t * 2, g.t * 2 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  drawCrisp(ctx, cx, g.y, g.t, {
    tilt: g.state === "over" ? 1.2 : tilt,
    flapRate: g.state === "over" ? 0 : holding ? 22 : 8,
    alpha: flashing ? 0.35 : 1,
  });

  // "+1", "Salted!" and friends drift up and fade.
  ctx.textAlign = "center";
  ctx.font = "900 18px Nunito, system-ui, sans-serif";
  for (const f of g.floaters) {
    ctx.fillStyle = `rgb(255 240 200 / ${1 - f.age / 0.8})`;
    ctx.fillText(f.text, f.x, f.y - f.age * 40);
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle) {
  if (o.kind === "pint") return drawPint(ctx, o);
  return drawHand(ctx, o);
}

/** A pint glass: slightly wider at the top, amber beer, white head with bubbles. */
function drawPint(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const { x, w, y } = o;
  const h = FLOOR_Y - y;
  const head = Math.min(22, h * 0.15);
  const taper = 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - taper, FLOOR_Y);
  ctx.lineTo(x + taper, FLOOR_Y);
  ctx.closePath();
  ctx.clip();
  const beer = ctx.createLinearGradient(x, 0, x + w, 0);
  beer.addColorStop(0, "#b86a10");
  beer.addColorStop(0.35, "#f0a531");
  beer.addColorStop(1, "#a85c0a");
  ctx.fillStyle = beer;
  ctx.fillRect(x, y, w, h);
  // Bubbles rising (fixed spots, they don't need to move to sell it).
  ctx.fillStyle = "rgb(255 240 200 / 0.5)";
  for (let i = 0; i < 6; i++) {
    const bx = x + 12 + ((i * 17) % (w - 20));
    const by = y + head + 14 + ((i * 53) % Math.max(10, h - head - 20));
    ctx.beginPath();
    ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // The head.
  ctx.fillStyle = "#fff6e3";
  ctx.fillRect(x, y, w, head);
  // Glass shine.
  ctx.fillStyle = "rgb(255 255 255 / 0.22)";
  ctx.fillRect(x + 8, y + head, 6, h - head);
  ctx.restore();
  // Frothy top edge spilling a little over the rim.
  ctx.fillStyle = "#fff6e3";
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(x + (i * w) / 4, y + 2, 7, Math.PI, 0);
    ctx.fill();
  }
  // Glass outline.
  ctx.strokeStyle = "rgb(255 255 255 / 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + taper, FLOOR_Y);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w - taper, FLOOR_Y);
  ctx.stroke();
}

/** A grabby hand reaching down from the top, in a checked shirt sleeve. */
function drawHand(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const [arm, hand] = shapes(o);
  if (hand.h <= 0) return;
  // Sleeve, with a simple check pattern.
  ctx.fillStyle = "#3b6ea5";
  ctx.fillRect(arm.x - 4, 0, arm.w + 8, Math.max(0, arm.h - 14));
  ctx.fillStyle = "rgb(255 255 255 / 0.16)";
  for (let yy = 0; yy < arm.h - 14; yy += 16) ctx.fillRect(arm.x - 4, yy, arm.w + 8, 6);
  for (let xx = arm.x; xx < arm.x + arm.w; xx += 16) ctx.fillRect(xx, 0, 6, Math.max(0, arm.h - 14));
  // Wrist.
  ctx.fillStyle = "#e9b48f";
  ctx.fillRect(arm.x + 2, Math.max(0, arm.h - 14), arm.w - 4, 16);
  // Palm and fingers (open, ready to grab).
  const top = hand.y;
  const fingerW = hand.w / 4 - 2;
  ctx.fillStyle = "#f2c19d";
  ctx.strokeStyle = "#b9805c";
  ctx.lineWidth = 1.5;
  roundRect(ctx, hand.x + 2, top, hand.w - 4, hand.h * 0.55, 10);
  for (let i = 0; i < 4; i++) {
    const fx = hand.x + 2 + i * (fingerW + 2);
    const len = hand.h * (i === 0 || i === 3 ? 0.85 : 1);
    roundRect(ctx, fx, top + hand.h * 0.3, fingerW, len - hand.h * 0.3, fingerW / 2);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
  ctx.stroke();
}

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, t: number) {
  ctx.save();
  ctx.translate(p.x, p.y + Math.sin(t * 4 + p.spin * 6) * 3);
  if (p.kind === "salt") {
    // A twinkling pinch of salt.
    ctx.rotate(t * 2);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-1.5, -12, 3, 24);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A crumb: a little jagged golden chip.
    ctx.rotate(p.spin * Math.PI * 2 + t * 1.5);
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = GOLD_EDGE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(-2, -7);
    ctx.lineTo(6, -4);
    ctx.lineTo(7, 3);
    ctx.lineTo(1, 7);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
