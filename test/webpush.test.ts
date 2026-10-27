import { describe, expect, it } from "vitest";
import { b64url, encryptPayload, makeVapidKeys, unb64url, vapidAuth } from "../worker/lib/webpush";

const enc = new TextEncoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// What the phone does with a push: undo RFC 8291 with its own private key.
async function phoneDecrypts(body: Uint8Array, phone: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  const uaPublic = new Uint8Array((await crypto.subtle.exportKey("raw", phone.publicKey)) as ArrayBuffer);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, phone.privateKey, 256));
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, sealed));
  return { rs, idlen, delimiter: plain[plain.length - 1], text: new TextDecoder().decode(plain.slice(0, -1)) };
}

describe("web push", () => {
  it("encrypts so only the phone can read it", async () => {
    const phone = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const p256dh = b64url((await crypto.subtle.exportKey("raw", phone.publicKey)) as ArrayBuffer);
    const message = JSON.stringify({ title: "New person", body: "@dave just joined Crunchd." });

    const body = await encryptPayload({ p256dh, auth: b64url(auth) }, message);
    const out = await phoneDecrypts(body, phone, auth);
    expect(out).toEqual({ rs: 4096, idlen: 65, delimiter: 2, text: message });
  });

  it("signs a VAPID token the push service can check", async () => {
    const keys = await makeVapidKeys();
    expect(unb64url(keys.publicKey)).toHaveLength(65);
    const header = await vapidAuth("https://web.push.apple.com/abc123", keys, "https://crunchd.example", 1_000_000);
    const [, token, k] = header.match(/^vapid t=(\S+), k=(\S+)$/)!;
    expect(k).toBe(keys.publicKey);

    const [h, c, sig] = token.split(".");
    const claims = JSON.parse(new TextDecoder().decode(unb64url(c)));
    expect(claims).toEqual({ aud: "https://web.push.apple.com", exp: 1_000_000 + 12 * 3600, sub: "https://crunchd.example" });
    const pub = await crypto.subtle.importKey("raw", unb64url(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64url(sig), enc.encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it("matches the worked example in RFC 8291 (appendix A)", async () => {
    const asPublic = unb64url("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    const jwk = {
      kty: "EC",
      crv: "P-256",
      d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
      x: b64url(asPublic.slice(1, 33)),
      y: b64url(asPublic.slice(33, 65)),
    };
    const server = {
      privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]),
      publicKey: await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, true, []),
    } as CryptoKeyPair;
    const body = await encryptPayload(
      {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
      "When I grow up, I want to be a watermelon",
      unb64url("DGv6ra1nlYgDCS1FRnbzlw"),
      server,
    );
    expect(b64url(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("base64url round trips", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    expect(unb64url(b64url(bytes))).toEqual(bytes);
  });
});
