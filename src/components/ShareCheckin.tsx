import { useEffect, useState } from "react";
import { logoFor } from "../lib/logos";
import { withInviter } from "../lib/ref";
import { makeShareCard, type ShareCardInput } from "../lib/shareCard";
import { useVoice } from "../lib/voice";
import type { BadgeState } from "../../shared/achievements";
import { NewBadges } from "./Achievements";

/**
 * Shown straight after a check-in: the points, a picture of it to share
 * ("I rated Scampi Fries 4.5 on Crunchd") and a Done button. The picture is
 * made as soon as this opens, because phones only allow the share sheet to
 * open in the moment after a tap, with no waiting in between.
 */
export function ShareCheckin({
  points,
  snack,
  rating,
  username,
  review,
  photo,
  newBadges = [],
  onDone,
}: {
  points: number;
  snack: { name: string; brand: string | null; category: string; photoId?: string | null };
  rating: number;
  username: string;
  review: string | null;
  photo: Blob | null; // the photo they just took, if any
  newBadges?: BadgeState[]; // badges this check-in earned
  onDone: () => void;
}) {
  const { t } = useVoice();
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // ?ref=share counts sign-ups from shared pictures in Settings > Users, and
  // ?by= gives you invite points if someone joins from it.
  const link = withInviter(`${window.location.origin}/?ref=share`, username);
  const site = window.location.host;
  const text = `I rated ${snack.name} ${Math.round(rating * 100) / 100}/5 on Crunchd. What would you give it? ${link}`;

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      // Their own photo first, then the snack's approved photo, then the maker's logo.
      let picture: ShareCardInput["picture"] = null;
      if (photo) picture = { blob: photo };
      else if (snack.photoId) picture = { url: `/api/photos/${snack.photoId}`, logo: false };
      else {
        const logoId = await logoFor(snack.brand).catch(() => null);
        if (logoId) picture = { url: `/api/logos/${logoId}`, logo: true };
      }
      const blob = await makeShareCard({ snackName: snack.name, brand: snack.brand, rating, username, review, picture, site });
      url = URL.createObjectURL(blob);
      setCard({ file: new File([blob], "crunchd.jpg", { type: "image/jpeg" }), url });
    })().catch(() => setFailed(true));
    return () => void (url && URL.revokeObjectURL(url));
  }, []);

  const canShareFile = card !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [card.file] });

  const share = async () => {
    setNote(null);
    try {
      if (canShareFile) await navigator.share({ files: [card!.file], text });
      else if (navigator.share) await navigator.share({ text, url: link });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Copied. Paste it into a chat.");
      }
    } catch (err) {
      // Closing the share sheet without picking an app isn't an error.
      if ((err as Error).name !== "AbortError") setNote("Couldn't open sharing. Save the picture instead.");
    }
  };

  return (
    <div className="page stack share-checkin">
      <div className="centre stack-sm">
        <h1 className="title">{points > 0 ? `+${points} pts` : t("toast.checkedIn")}</h1>
        <p className="muted no-margin">{t("share.prompt", { category: snack.category })}</p>
      </div>

      <NewBadges badges={newBadges} username={username} />

      <div className="share-preview">
        {card ? (
          <img src={card.url} alt={`I rated ${snack.name} ${rating} on Crunchd`} />
        ) : failed ? (
          <p className="small muted">Couldn't make the picture, but you can still share a link.</p>
        ) : (
          <p className="small muted">Making your picture…</p>
        )}
      </div>

      {note && <p className="small muted centre no-margin">{note}</p>}
      <button type="button" className="button big" disabled={!card && !failed} onClick={share}>
        {canShareFile ? "Share picture" : "Share"}
      </button>
      <div className="two-up">
        <a className="button secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        {card ? (
          <a className="button secondary" href={card.url} download="crunchd.jpg">
            Save picture
          </a>
        ) : (
          <span />
        )}
      </div>
      <button type="button" className="button dark" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
