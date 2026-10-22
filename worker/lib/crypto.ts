// Password hashing and random tokens, using the Web Crypto API built into Workers.

const PBKDF2_ITERATIONS = 100_000; // the most Workers allows for PBKDF2
const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A random, URL-safe string with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** A short random id for database rows. */
export function newId(): string {
  return randomToken(12);
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return toBase64Url(new Uint8Array(digest));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/**
 * Hash a password for storage. The result records the algorithm, iteration
 * count and salt, so the cost can be raised later without breaking old hashes.
 * Format: pbkdf2-sha256$<iterations>$<salt>$<hash>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterations, salt, expected] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const actual = await pbkdf2(password, fromBase64Url(salt), Number(iterations));
  return timingSafeEqual(actual, fromBase64Url(expected));
}

// Compares every byte, so the time taken does not reveal how much matched.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
