/**
 * Reads a required server-side env var, throwing a clear error if missing.
 * Never import this into client components (server-only vars).
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  google: {
    get clientId() {
      return requireEnv("GOOGLE_CLIENT_ID");
    },
    get clientSecret() {
      return requireEnv("GOOGLE_CLIENT_SECRET");
    },
    get redirectUri() {
      return requireEnv("GOOGLE_OAUTH_REDIRECT_URI");
    },
  },
  supabase: {
    get url() {
      return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    },
    get serviceRoleKey() {
      return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    },
  },
};
