import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/google/oauth";

export const runtime = "nodejs";

/** Kicks off the Google consent flow. Sets a CSRF `state` cookie that the
 *  callback verifies. Single-channel: whoever runs this connects the channel. */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
