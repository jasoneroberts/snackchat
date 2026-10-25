// Send crashes to the server so they show on the admin Health page. Each
// page load sends at most a few, and the same message only once.

const MAX_REPORTS = 5;
const sent = new Set<string>();

export function reportError(error: unknown, extra?: string) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const message = err.message || "Unknown error";
  if (sent.has(message) || sent.size >= MAX_REPORTS) return;
  sent.add(message);
  const body = JSON.stringify({
    message,
    detail: [err.stack, extra].filter(Boolean).join("\n\n"),
    path: location.pathname,
  });
  // keepalive lets the report finish even if the page is reloading.
  fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** Catch errors React's error boundary can't see: event handlers, timers, promises. */
export function listenForErrors() {
  window.addEventListener("error", (e) => {
    // Script errors from other sites (browser extensions) come through as "Script error." with no detail.
    if (e.message === "Script error." && !e.error) return;
    reportError(e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason));
}
