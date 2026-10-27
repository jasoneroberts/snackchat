// Web Push, done by hand with WebCrypto so the Worker needs no extra library.
// Two standards are involved:
// - VAPID (RFC 8292): each push carries a short token signed with the
//   server's own key, so the push service knows the message is from us.
// - Message encryption (RFC 8291, "aes128gcm"): the text is encrypted for the
//   one phone it's going to, using keys the phone handed over when it
//   subscribed. The push service (Apple, Google, Mozilla) can't read it.

export interface PushTarget {
  endpoint: string;
  p256dh: string; // the phone's public key, base64url
  auth: string; // the phone's 16-byte secret, base64url
}

export interface VapidKeys {
  publicKey: string; // base64url, 65 raw bytes: what the browser needs to subscribe
  privateJwk: JsonWebKey;
}

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A new VAPID key pair (P-256). Made once and kept in the database. */
export async function makeVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  return { publicKey: b64url(raw), privateJwk: (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey };
}

/** The signed token for one push service, valid for 12 hours. */
export async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, nowSeconds: number): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto gives the raw r||s signature, which is what a JWT wants.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/**
 * Encrypt a message for one phone (RFC 8291). Returns the request body:
 * a small header (salt, record size, our one-off public key) and the
 * encrypted text. `salt` and `serverKeys` are only passed in by tests.
 */
export async function encryptPayload(
  target: Pick<PushTarget, "p256dh" | "auth">,
  plaintext: string,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  serverKeys?: CryptoKeyPair,
): Promise<Uint8Array> {
  const uaPublic = unb64url(target.p256dh);
  const authSecret = unb64url(target.auth);
  // A fresh key pair for every message, so no two messages share a key.
  const local = serverKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // (Workers' types spell the field "$public"; at runtime it's "public", as in the standard.)
  const ecdh = { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256));

  // Mix the shared secret with the phone's auth secret, then derive the content key and nonce.
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One record: the text, then 0x02 to mark it as the last (and only) record.
  const record = concat(enc.encode(plaintext), new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, record));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/**
 * Send one push. Returns the push service's status: 201 is sent, and 404 or
 * 410 mean the phone has unsubscribed, so the subscription can be deleted.
 */
export async function sendPush(target: PushTarget, payload: string, keys: VapidKeys, subject: string): Promise<number> {
  const body = await encryptPayload(target, payload);
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(target.endpoint, keys, subject, Math.floor(Date.now() / 1000)),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 3600),
      // "high" wakes a sleeping phone. With "normal", Android (via Google's
      // push service) holds the message until the phone or Chrome next wakes,
      // so it only appeared when the app was opened.
      Urgency: "high",
    },
    body,
  });
  return res.status;
}
