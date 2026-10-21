// Server-side check of a Turnstile token sent up by the browser.
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(secret: string, token: unknown, ip: string | null): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;
  const body = new FormData();
  body.append("secret", secret);
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
