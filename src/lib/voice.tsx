// React side of lad mode: which voice this person picked, and a `t` helper
// for looking up the app's words in it. The words themselves live in
// shared/voice.ts.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { line, type LineKey, type LineOptions, type Voice } from "../../shared/voice";

const VoiceContext = createContext<Voice>("grownup");

export function VoiceProvider({ voice, children }: { voice: Voice; children: ReactNode }) {
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

/** The current voice, and `t` to look up a line in it. */
export function useVoice() {
  const voice = useContext(VoiceContext);
  return useMemo(() => ({ voice, t: (key: LineKey, options?: LineOptions) => line(voice, key, options) }), [voice]);
}
