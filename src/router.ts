import { useEffect, useState } from "react";

// A tiny router: enough for a handful of pages without a library.
// navigate() changes the address bar; usePath() re-renders when it changes.

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return path;
}

/** Match "/snack/:id" style paths: matchPath("/snack/", path) → "abc" or null. */
export function matchPath(prefix: string, path: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const rest = decodeURIComponent(path.slice(prefix.length));
  return rest && !rest.includes("/") ? rest : null;
}
