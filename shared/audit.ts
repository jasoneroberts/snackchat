// Plain words for what an admin did, from the request that did it. The audit
// log stores the method and path (e.g. POST /users/abc/pin); the Health page
// shows "Reset a PIN".

const RULES: [method: string, pattern: RegExp, label: string | ((action: string | null) => string)][] = [
  ["POST", /^\/photos\/[^/]+$/, (a) => (a === "reject" ? "Rejected a photo" : "Approved a photo")],
  ["POST", /^\/photos\/[^/]+\/hide$/, "Hid a photo"],
  ["POST", /^\/avatars\/[^/]+$/, (a) => (a === "reject" ? "Rejected a profile picture" : "Approved a profile picture")],
  ["POST", /^\/demo$/, "Loaded demo data"],
  ["DELETE", /^\/demo$/, "Removed demo data"],
  ["POST", /^\/brands\/logo$/, "Uploaded a brand logo"],
  ["DELETE", /^\/brands\/logo$/, "Removed a brand logo"],
  ["POST", /^\/brands\/suggestion\/approve$/, "Used a suggested logo"],
  ["POST", /^\/brands\/suggestion\/reject$/, "Skipped a suggested logo"],
  ["POST", /^\/users\/[^/]+\/pin$/, "Reset a PIN"],
  ["PATCH", /^\/snacks\/[^/]+$/, "Edited a snack"],
  ["POST", /^\/snacks\/[^/]+\/status$/, (a) => (a === "reject" ? "Rejected a new snack" : "Approved a new snack")],
  ["PUT", /^\/snacks\/[^/]+\/cover$/, "Picked a snack's main picture"],
  ["PUT", /^\/diet\/[^/]+$/, "Set diet labels"],
  ["POST", /^\/health\/backups$/, "Made a backup"],
  ["POST", /^\/reports\/[^/]+\/[^/]+$/, (a) => REPORT_OUTCOMES[a ?? ""] ?? "Dealt with a report"],
];

const REPORT_OUTCOMES: Record<string, string> = {
  dismiss: "Dismissed a report",
  "remove-text": "Removed a reported review",
  "hide-photo": "Hid a reported photo",
  "delete-checkin": "Deleted a reported check-in",
  "remove-avatar": "Removed a reported profile picture",
  "delete-account": "Deleted a reported account",
};

/** "Reset a PIN" for POST /users/abc/pin. Unknown requests show as-is. */
export function describeAdminAction(method: string, path: string, detail: string | null): string {
  let action: string | null = null;
  try {
    const parsed = detail ? (JSON.parse(detail) as { action?: unknown }) : null;
    if (typeof parsed?.action === "string") action = parsed.action;
  } catch {
    // Not JSON: no action to read.
  }
  for (const [m, pattern, label] of RULES) {
    if (m === method && pattern.test(path)) return typeof label === "string" ? label : label(action);
  }
  return `${method} ${path}`;
}
