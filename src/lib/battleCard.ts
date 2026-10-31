// The Crisp of the Week picture: both snacks side by side with their share
// of the vote, the winner (or the one you backed, mid-week) crowned.

import { percentages, type Battle, type BattleSnack } from "../../shared/achievements";
import { FONT, INK, MUTED, ORANGE, ORANGE_DARK, CREAM, W, drawFit, loadPicture, roundRect, type Picture } from "./shareCard";
import { wrap } from "./textWrap";
import { drawBackground, drawCard, drawFooter, drawHeader, newCanvas, toJpeg } from "./badgeCard";
import { logoFor } from "./logos";

async function pictureOf(s: BattleSnack): Promise<Picture | null> {
  if (s.photoId) return loadPicture({ url: `/api/photos/${s.photoId}`, logo: false });
  const logoId = await logoFor(s.brand).catch(() => null);
  return logoId ? loadPicture({ url: `/api/logos/${logoId}`, logo: true }) : null;
}

/** `finished` battles show the result; this week's shows the votes so far and "I voted for". */
export async function makeBattleCard(input: { battle: Battle; site: string }): Promise<Blob> {
  const { battle } = input;
  const finished = battle.winner !== undefined;
  const votes = battle.votes ?? { a: 0, b: 0 };
  const pct = percentages(votes.a, votes.b);
  const { canvas, ctx, icon } = await newCanvas();
  const [pa, pb] = await Promise.all([pictureOf(battle.a), pictureOf(battle.b)]);
  drawBackground(ctx);
  drawHeader(ctx, icon);

  const cardX = 70;
  const cardW = W - cardX * 2;
  const cardY = 310;
  const cardH = 1290;
  drawCard(ctx, cardX, cardY, cardW, cardH);
  ctx.textAlign = "center";
  const mid = W / 2;

  ctx.fillStyle = ORANGE_DARK;
  ctx.font = `900 76px ${FONT}`;
  ctx.fillText("Crisp of the Week", mid, cardY + 120);
  ctx.fillStyle = MUTED;
  ctx.font = `800 40px ${FONT}`;
  const week = new Date(battle.weekStart * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  ctx.fillText(finished ? `Result · week of ${week}` : `Week of ${week}`, mid, cardY + 180);

  const top = cardY + 330;
  const side = (snack: BattleSnack, pic: Picture | null, percent: number, x: number, crowned: boolean) => {
    const size = 340;
    const px = x - size / 2;
    ctx.save();
    roundRect(ctx, px, top, size, size, 36);
    ctx.clip();
    ctx.fillStyle = CREAM;
    ctx.fillRect(px, top, size, size);
    if (!pic) {
      // No photo or logo: the snack's first letter, big, so the square isn't empty.
      ctx.fillStyle = ORANGE;
      ctx.font = `900 200px ${FONT}`;
      ctx.fillText(snack.name.trim().charAt(0).toUpperCase(), x, top + size / 2 + 72);
    } else {
      if (pic.logo) drawFit(ctx, pic.image, px + 50, top + 50, size - 100, "contain");
      else drawFit(ctx, pic.image, px, top, size, "cover");
    }
    ctx.restore();
    if (crowned) {
      ctx.lineWidth = 14;
      ctx.strokeStyle = ORANGE;
      roundRect(ctx, px - 7, top - 7, size + 14, size + 14, 42);
      ctx.stroke();
      ctx.font = `90px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText("👑", x, top + 6);
    }
    ctx.fillStyle = INK;
    ctx.font = `900 54px ${FONT}`;
    let y = top + size + 80;
    for (const l of wrap(ctx, snack.name, 420, 2)) {
      ctx.fillText(l, x, y);
      y += 62;
    }
    ctx.fillStyle = crowned ? ORANGE_DARK : MUTED;
    ctx.font = `900 120px ${FONT}`;
    ctx.fillText(`${percent}%`, x, top + size + 320);
  };
  const crown = finished ? battle.winner : battle.myVote;
  side(battle.a, pa, pct.a, mid - 230, crown === battle.a.id);
  side(battle.b, pb, pct.b, mid + 230, crown === battle.b.id);

  ctx.fillStyle = MUTED;
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText("vs", mid, top + 190);

  ctx.font = `800 42px ${FONT}`;
  const total = votes.a + votes.b;
  const line = finished
    ? battle.winner
      ? `${battle.winner === battle.a.id ? battle.a.name : battle.b.name} wins`
      : "A dead heat"
    : battle.myVote
      ? `I voted for ${battle.myVote === battle.a.id ? battle.a.name : battle.b.name}`
      : "";
  ctx.fillStyle = INK;
  const lines = wrap(ctx, line, cardW - 120, 2);
  lines.forEach((l, i) => ctx.fillText(l, mid, cardY + cardH - 110 - (lines.length - 1 - i) * 52));
  ctx.fillStyle = MUTED;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(`${total} ${total === 1 ? "vote" : "votes"}`, mid, cardY + cardH - 60);

  drawFooter(ctx, finished ? "Who gets your vote this week?" : "Which would you pick?", input.site);
  return toJpeg(canvas);
}
