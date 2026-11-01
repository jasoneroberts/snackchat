// The last thing this phone saw, kept in localStorage so the app can draw it
// the moment it opens, before the server has answered. The fresh answer then
// replaces it (usually a fraction of a second later), and on no signal the
// last-seen copy stays up instead of a blank "Loading…".
//
// Only the signed-in person's own view is kept (who they are, the first page
// of their feed), and logging out wipes it, so a shared phone shows nothing
// to the next person.

const PREFIX = "crunchd.snap.";

export function readSnapshot<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // private browsing, storage full, or an old format
  }
}

export function writeSnapshot(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app just won't open quite as fast.
  }
}

export function clearSnapshots(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // Nothing kept, nothing to clear.
  }
}
