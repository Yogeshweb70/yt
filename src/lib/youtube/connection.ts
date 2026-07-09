import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshAccessToken, type GoogleTokens } from "@/lib/google/oauth";
import { encrypt, decrypt } from "@/lib/crypto";
import type { YoutubeConnection } from "@/lib/supabase/types";

const TABLE = "youtube_connection";
// Refresh a bit before actual expiry to avoid mid-request 401s.
const EXPIRY_SKEW_MS = 60_000;

// Tokens are encrypted at rest (Phase 8). decrypt() passes plaintext through,
// so any row written before encryption keeps working until its next update.
export async function getConnection(): Promise<YoutubeConnection | null> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  const conn = (data as YoutubeConnection | null) ?? null;
  if (!conn) return null;
  return {
    ...conn,
    access_token: decrypt(conn.access_token) ?? conn.access_token,
    refresh_token: decrypt(conn.refresh_token) ?? conn.refresh_token,
  };
}

/** Persist tokens after the initial OAuth exchange. */
export async function saveConnection(params: {
  tokens: GoogleTokens;
  channelId?: string | null;
  channelTitle?: string | null;
}): Promise<void> {
  const { tokens, channelId, channelTitle } = params;
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Re-run consent with prompt=consent&access_type=offline.",
    );
  }
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await supabaseAdmin().from(TABLE).upsert({
    id: true,
    channel_id: channelId ?? null,
    channel_title: channelTitle ?? null,
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    scope: tokens.scope,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Returns a currently-valid access token, refreshing and persisting a new one
 * if the stored token is expired or about to expire.
 * Throws if no channel is connected yet.
 */
export async function getValidAccessToken(): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error("No YouTube channel connected. Complete OAuth first.");

  const expiresAtMs = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAtMs - EXPIRY_SKEW_MS) {
    return conn.access_token;
  }

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const expiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000,
  ).toISOString();
  const { error } = await supabaseAdmin()
    .from(TABLE)
    .update({
      access_token: encrypt(refreshed.access_token),
      // Google typically omits refresh_token on refresh — keep the old one.
      // conn.refresh_token is already decrypted here, so re-encrypt.
      refresh_token: encrypt(refreshed.refresh_token ?? conn.refresh_token),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw error;
  return refreshed.access_token;
}

/** Fetch the connected channel's id + title via the Data API. */
export async function fetchOwnChannel(
  accessToken: string,
): Promise<{ id: string; title: string } | null> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    items?: { id: string; snippet: { title: string } }[];
  };
  const item = json.items?.[0];
  return item ? { id: item.id, title: item.snippet.title } : null;
}
