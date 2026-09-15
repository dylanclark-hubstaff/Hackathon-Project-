// AES-GCM encryption for secrets at rest (integration API keys/tokens, Outline
// key). Uses the CREDENTIALS_ENCRYPTION_KEY Edge Function secret (32-byte key,
// base64-encoded - generate with `openssl rand -base64 32`).
// Stored format: base64(iv) + "." + base64(ciphertext).

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(ciphertext)))}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  const key = await getKey();
  const [ivB64, ctB64] = stored.split(".");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
