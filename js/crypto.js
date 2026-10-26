// The trip data ships encrypted (AES-GCM, key from PBKDF2-SHA256 of the passphrase).
// After the first unlock the derived key is kept on this device so the app opens offline.

import { store } from "./util.js";

const b64 = {
  to: buf => btoa(String.fromCharCode(...new Uint8Array(buf))),
  from: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
};

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64.from(salt), iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
}

async function decryptWith(key, blob) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.from(blob.iv) }, key, b64.from(blob.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function loadBlob() {
  const res = await fetch("data.enc.json", { cache: "no-cache" }).catch(() => null)
    || await caches.match("data.enc.json");
  if (!res || !res.ok) throw new Error("no-data");
  return res.json();
}

// Try the key saved on this device. Returns the data, or null if a passphrase is needed.
export async function unlockSaved(blob) {
  const saved = store.get("key");
  if (!saved || saved.salt !== blob.salt) return null;
  try {
    const key = await crypto.subtle.importKey("raw", b64.from(saved.raw), "AES-GCM", false, ["decrypt"]);
    return await decryptWith(key, blob);
  } catch { return null; }
}

export async function unlockWith(passphrase, blob) {
  const key = await deriveKey(passphrase.trim(), blob.salt, blob.iter);
  const data = await decryptWith(key, blob); // throws if the passphrase is wrong
  const raw = await crypto.subtle.exportKey("raw", key);
  store.set("key", { salt: blob.salt, raw: b64.to(raw) });
  return data;
}

export function forgetKey() { store.del("key"); }
