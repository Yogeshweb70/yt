#!/usr/bin/env node
// Step 16: fail fast on missing critical env before starting in production.
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  "WORKER_SHARED_SECRET",
  "APP_ENCRYPTION_KEY",
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[validate-env] Missing required env vars:\n  - ${missing.join("\n  - ")}`);
  process.exit(1);
}
console.log("[validate-env] OK — all required env present.");
