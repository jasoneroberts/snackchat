// Small wrapper around fetch for the Crunchd API.

import type { Voice } from "../shared/voice";

export interface Me {
  id: string;
  username: string;
  emailVerified: boolean;
  country: string;
  points: number;
  avatarId: string | null;
  avatarPendingId: string | null;
  isAdmin: boolean;
  reviewCount: number;
  pendingSnacks: number;
  openReports: number;
  newUsers: number;
  /** Check-in reminders on (they're on unless turned off). */
  reminders: boolean;
  /** null until they've picked lad mode or grown-up mode. */
  voice: Voice | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Call the API. A plain object body is sent as JSON; a FormData body (used for
 * photo uploads) is sent as-is so the browser sets the multipart boundary.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: Record<string, unknown> | FormData } = {},
): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: isForm ? (init.body as FormData) : init.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "Something went wrong.", res.status);
  return data as T;
}

/** Everything waiting for an admin: the number on the Me tab and the app icon. */
export const adminToDo = (me: Me) => (me.isAdmin ? me.reviewCount + me.pendingSnacks + me.openReports + me.newUsers : 0);

export const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong.");
