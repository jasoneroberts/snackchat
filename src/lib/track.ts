import type { UsageFeature } from "../../shared/usage";

/**
 * Tell the server someone played Wing It or shared something, for the admin
 * Stats page. Fire and forget: it never waits, never shows an error, and
 * `keepalive` lets it finish even if the page is closing (as it can when the
 * share sheet hands over to WhatsApp).
 */
export function track(feature: Exclude<UsageFeature, "open">): void {
  fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}
