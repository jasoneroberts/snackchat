// Server-side check of a Turnstile token sent up by the browser.
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare's public test secret: every token passes. Used only until a real
// TURNSTILE_SECRET_KEY is set on the Worker. Swap in real keys before inviting
// people beyond a handful of testers (README, Deploy step 1).
export const TEST_SECRET = "1x0000000000000000000000000000000AA";

export function turnstileInTestMode(secret: string | undefined): boolean {
  return !secret || secret === TEST_SECRET;
}

export async function verifyTurnstile(secret: string | undefined, token: unknown, ip: string | null): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;
  if (!secret) console.warn("TURNSTILE_SECRET_KEY is not set: using Cloudflare's always-pass test key");
  const body = new FormData();
  body.append("secret", secret || TEST_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const outcome = await res.json<{ success: boolean }>();
    return outcome.success === true;
  } catch (err) {
    // If Cloudflare can't be reached, fail closed: no token check, no sign-up.
    console.error("turnstile verify failed", err);
    return false;
  }
}
