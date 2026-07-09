import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// AES-256-GCM at-rest encryption for stored credentials.
// Format: "enc:v1:" + base64(iv).base64(tag).base64(ciphertext)
// decrypt() passes through any non-prefixed value, so pre-encryption (legacy)
// rows keep working — encryption rolls forward transparently on next write.

const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) throw new Error("APP_ENCRYPTION_KEY not set");
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function isEncrypted(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(PREFIX);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value; // legacy plaintext passthrough
  const [ivB, tagB, ctB] = value.slice(PREFIX.length).split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Irreversible fingerprint for showing "which key is set" without revealing it. */
export function fingerprint(v: string): string {
  return createHash("sha256").update(v).digest("hex").slice(0, 8);
}
