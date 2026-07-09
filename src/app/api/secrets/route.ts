import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stores an encrypted provider credential. Validates the key before saving.
 * Body: { provider, value }. Protected by WORKER_SHARED_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { provider?: string; value?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }
  if (!body.provider || !body.value) {
    return NextResponse.json({ error: "provider and value required" }, { status: 400 });
  }
  try {
    const { setSecret, validateSecret } = await import("@/services/secrets");
    const provider = body.provider as Parameters<typeof setSecret>[0];
    const valid = await validateSecret(provider, body.value);
    if (!valid) return NextResponse.json({ ok: false, error: "key validation failed" }, { status: 400 });
    await setSecret(provider, body.value);
    return NextResponse.json({ ok: true, provider });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
