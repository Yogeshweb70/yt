// Run: node --experimental-strip-types src/lib/crypto.test.ts
process.env.APP_ENCRYPTION_KEY = "test-key-do-not-use-in-prod";
const { encrypt, decrypt, isEncrypted, fingerprint } = await import("./crypto.ts");

let failures = 0;
function ok(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL ${name}`);
  } else console.log(`ok   ${name}`);
}

const secret = "ya29.super-secret-refresh-token";
const enc = encrypt(secret);

ok("roundtrip", decrypt(enc) === secret);
ok("ciphertext differs from plain", enc !== secret);
ok("is tagged encrypted", isEncrypted(enc));
ok("two encryptions differ (random iv)", encrypt(secret) !== encrypt(secret));
ok("legacy passthrough", decrypt("plain-legacy-token") === "plain-legacy-token");
ok("null passthrough", decrypt(null) === null);
ok("fingerprint stable", fingerprint(secret) === fingerprint(secret));

// Tamper detection: flip a byte in the ciphertext -> auth tag must reject.
let tampered = false;
try {
  const parts = enc.slice("enc:v1:".length).split(".");
  const ct = Buffer.from(parts[2], "base64");
  ct[0] ^= 0xff;
  parts[2] = ct.toString("base64");
  decrypt("enc:v1:" + parts.join("."));
} catch {
  tampered = true;
}
ok("tamper detected", tampered);

if (failures) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
} else console.log("\nALL PASS");
