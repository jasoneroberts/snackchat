// Small wrapper around fetch for the Snackchat API.

export interface Me {
  id: string;
  username: string;
  emailVerified: boolean;
  country: string;
}

export class ApiError extends Error {}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}
