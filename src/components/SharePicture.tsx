import { useEffect, useState } from "react";
import { track } from "../lib/track";

/**
 * A sheet for sharing a picture made on the phone (a badge, a Crisp of the
 * Week result): a preview, then Share, WhatsApp and Save. The picture is
 * made as soon as the sheet opens, because phones only let the share sheet
 * open straight after a tap, with no waiting in between (as in ShareCheckin).
 */
export function SharePicture({
  title,
  make,
  text,
  link,
  alt,
  onClose,
}: {
  title: string;
  make: () => Promise<Blob>;
  text: string; // the message that goes with it, ending in the link
  link: string;
  alt: string;
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    make()
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setCard({ file: new File([blob], "crunchd.jpg", { type: "image/jpeg" }), url });
      })
      .catch(() => setFailed(true));
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
      track("share");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setNote("Couldn't open sharing. Save the picture instead.");
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">{title}</h2>
        <div className="share-preview small-preview">
          {card ? (
            <img src={card.url} alt={alt} />
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
          <a className="button secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} onClick={() => track("share")} target="_blank" rel="noreferrer">
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
        <button type="button" className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
