import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { exchangeCode } from "@/lib/google/oauth";
import { saveConnection, fetchOwnChannel } from "@/lib/youtube/connection";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const dashboard = new URL("/dashboard", env.appUrl);

  if (error) {
    dashboard.searchParams.set("connect", "error");
    dashboard.searchParams.set("reason", error);
    return NextResponse.redirect(dashboard);
  }

  const cookieState = req.cookies.get("g_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    dashboard.searchParams.set("connect", "error");
    dashboard.searchParams.set("reason", "state_mismatch");
    return NextResponse.redirect(dashboard);
  }

  try {
    const tokens = await exchangeCode(code);
    const channel = await fetchOwnChannel(tokens.access_token);
    await saveConnection({
      tokens,
      channelId: channel?.id,
      channelTitle: channel?.title,
    });
    dashboard.searchParams.set("connect", "ok");
  } catch (e) {
    dashboard.searchParams.set("connect", "error");
    dashboard.searchParams.set(
      "reason",
      e instanceof Error ? e.message : "unknown",
    );
  }

  const res = NextResponse.redirect(dashboard);
  res.cookies.delete("g_oauth_state");
  return res;
}
