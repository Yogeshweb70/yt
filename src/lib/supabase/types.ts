/**
 * Hand-maintained DB types for the tables the app touches directly.
 * Regenerate with `supabase gen types typescript` once the project is linked;
 * until then this keeps server code strictly typed.
 */
export interface YoutubeConnection {
  id: true;
  channel_id: string | null;
  channel_title: string | null;
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_at: string; // ISO timestamptz
  updated_at: string;
}

export interface LogRow {
  id: string;
  user_id: string | null;
  level: "info" | "warn" | "error";
  scope: string | null;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}
