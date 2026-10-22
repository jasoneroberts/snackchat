import { useState } from "react";
import { line, VOICES, type Voice } from "../../shared/voice";
import { api, errorText } from "../api";

// Each option previews itself: the card carries data-voice, so the lad card
// picks up the dark pub colours from styles.css even before you choose it.
const PREVIEW: Record<Voice, { blurb: string; sample: string }> = {
  grownup: { blurb: "Clean and friendly. Good for families.", sample: "Rate every snack. Beat your mates." },
  lad: { blurb: "Grittier, with pub banter. Kids snacks stay grown-up.", sample: "Rate the crunch. Bury your mates." },
};

/** Two big buttons, grown-up and lad, that save the choice straight away. */
export function VoiceChoice({ current, onSaved }: { current: Voice | null; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState<Voice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (voice: Voice) => {
    setBusy(voice);
    setError(null);
    try {
      await api("/me/voice", { method: "PUT", body: { voice } });
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack-sm">
      {VOICES.map((v) => (
        <button
          key={v}
          type="button"
          data-voice={v}
          className={current === v ? "voice-option on" : "voice-option"}
          aria-pressed={current === v}
          disabled={busy !== null}
          onClick={() => void pick(v)}
        >
          <b className="voice-name">{line("grownup", v === "lad" ? "voice.lad" : "voice.grownup")}</b>
          <span className="voice-sample">{PREVIEW[v].sample}</span>
          <span className="small voice-blurb">{busy === v ? "Saving…" : PREVIEW[v].blurb}</span>
        </button>
      ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
