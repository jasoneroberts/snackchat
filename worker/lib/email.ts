import type { Env } from "../env";

interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * Send a transactional email. In "log" mode (the default until Snackchat has
 * its own domain) the message is written to the Worker logs instead, where
 * `wrangler tail` or the dashboard's Logs tab shows it.
 */
export async function sendEmail(env: Env, email: Email): Promise<void> {
  if (env.EMAIL_MODE !== "resend" || !env.RESEND_API_KEY) {
    console.log(`[email:log] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: email.to, subject: email.subject, text: email.text }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
}
