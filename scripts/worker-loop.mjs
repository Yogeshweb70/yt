#!/usr/bin/env node
// Scheduler: repeatedly ticks the durable queue and dispatches the daily run.
// Runs beside the app instance that has ffmpeg + chromium.
const APP = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.WORKER_SHARED_SECRET ?? "";
const TICK_MS = Number(process.env.TICK_INTERVAL_MS ?? 15000);
const DISPATCH_HOUR = Number(process.env.DISPATCH_HOUR_UTC ?? 6);

const headers = { "Content-Type": "application/json", "x-worker-secret": SECRET };
let lastDispatchDay = "";

async function post(path, body) {
  try {
    const res = await fetch(`${APP}${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
    return await res.json();
  } catch (e) {
    console.error(`[worker-loop] ${path} failed:`, e.message);
    return null;
  }
}

async function loop() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === DISPATCH_HOUR && lastDispatchDay !== day) {
    lastDispatchDay = day;
    console.log("[worker-loop] dispatching daily run", day);
    await post("/api/queue/dispatch");
  }
  const r = await post("/api/queue/tick", { workerId: "loop", max: 3 });
  if (r?.processed) console.log(`[worker-loop] processed ${r.processed}, failed ${r.failed}`);
}

console.log(`[worker-loop] started; ticking every ${TICK_MS}ms against ${APP}`);
setInterval(loop, TICK_MS);
