import { useEffect, useRef } from "react";

// Cloudflare's always-pass test key is the fallback for local development.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * The Turnstile bot check. It usually solves itself without the person doing
 * anything, then hands us a one-time token that the server verifies.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
      });
    });
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [onToken]);
  return <div ref={ref} className="turnstile" />;
}
