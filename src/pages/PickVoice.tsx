import type { Me } from "../api";
import { VoiceChoice } from "../components/VoiceChoice";

/** Asked once, straight after joining (and once for people who joined before lad mode existed). */
export function PickVoice({ me, onChanged }: { me: Me; onChanged: () => Promise<void> }) {
  return (
    <div className="page stack">
      <div>
        <h1 className="title">Which are you, {me.username}?</h1>
        <p className="muted">Pick how Crunchd talks to you. Same snacks, same points, same boards. You can switch any time in Settings.</p>
      </div>
      <VoiceChoice current={me.voice} onSaved={onChanged} />
    </div>
  );
}
