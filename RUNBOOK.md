# RUNBOOK — AI Shorts Studio

Operational guide for running the autonomous pipeline in production.
See [CONTINUE.md](./CONTINUE.md) for build status and [DEPLOY.md](./DEPLOY.md)
for topology.

## Topology (single-channel)

- **web** (Vercel or container): UI + enqueue routes. Stateless.
- **worker** (container w/ ffmpeg + chromium): runs the full app; processes
  queue ticks incl. render/upload. Must NOT be Vercel serverless.
- **scheduler** (`scripts/worker-loop.mjs`): ticks `/api/queue/tick` and fires
  the daily `/api/queue/dispatch`.
- **Supabase** (Postgres): all state. **Cloudflare R2**: media.

## Production checklist (Step 10)

- [ ] `npm run validate-env` passes on the worker host.
- [ ] `APP_ENCRYPTION_KEY` set (32+ chars) and **backed up** in a secrets
      manager. Losing it = all stored tokens/secrets unrecoverable.
- [ ] All `supabase/phase*.sql` applied in order (1→9).
- [ ] Google OAuth: channel account added as **test user**; `youtube.upload`
      scope granted. Complete the one-time connect at `/dashboard`.
- [ ] `YOUTUBE_PRIVACY=private` for the FIRST live run (avoid public mistakes).
- [ ] `DAILY_TOPIC_COUNT` set with quota headroom (topics × langs ≤ 6/day).
- [ ] `WORKER_SHARED_SECRET` set; confirm all `/api/*` worker routes 401 without it.
- [ ] Health check green: `GET /api/health`.
- [ ] `npm test` green (unit + reliability).

## Daily operation

- Scheduler auto-dispatches at `DISPATCH_HOUR_UTC` and ticks every
  `TICK_INTERVAL_MS`.
- Watch `/dashboard/ops` (success rate, latency), `/dashboard/system` (queue,
  DLQ, cost), `/dashboard/analytics`.
- Alerts post to `NOTIFY_WEBHOOK_URL` (CTR/retention drop, quota low, errors).

## Monitoring checklist (Step 6)

- Queue depth (`/dashboard/system`): sustained rising pending → scheduler down
  or a stuck job type.
- Dead-letter count > 0 → inspect `queue_jobs` where `status='dead'`, fix root
  cause, requeue (see below).
- p95 latency (`/dashboard/ops`): render/upload spikes → worker resource limits.
- `api_quota` / cost dashboard: approaching daily YouTube quota or cost budget.

## Recovery procedures (Steps 2, 7)

**A job is stuck in `running` (worker crashed mid-job):**
The lock goes stale after 10 min and the job is auto-reclaimed on the next tick.
No action needed. To force: `update queue_jobs set status='pending',
locked_at=null where id='…'`.

**A job dead-lettered:**
`update queue_jobs set status='pending', attempts=0, run_after=now() where
id='…'` after fixing the cause. Each stage is idempotent (`jobs` table), so a
requeue resumes from the last incomplete sub-step — it will not re-upload an
already-published video (guarded by existing `youtube_id`).

**Restart / redeploy:**
Safe at any time. In-flight `running` jobs are reclaimed via stale-lock; pending
jobs resume on next tick. No job is lost. (Verified by
`tests/queue.recovery.test.ts` + `tests/jobs.idempotency.test.ts`.)

**Expired / revoked OAuth (`invalid_grant`):**
Re-run the connect flow at `/dashboard`. Tokens are encrypted at rest.

**YouTube quota exceeded:**
`publish` fails with a QuotaError and retries next window automatically
(backoff). Lower `DAILY_TOPIC_COUNT` or request a quota increase.

## Rollback procedure

1. Redeploy the previous image/commit (web + worker).
2. Migrations are additive-only — no down-migration needed; older code ignores
   new columns/tables.
3. Pause processing during investigation: stop the `scheduler` service (queue
   accrues safely; nothing is lost).

## Disaster recovery

- **State**: Supabase managed daily backups (enable PITR for tighter RPO).
- **Media**: R2 objects are referenced by DB rows; re-render is possible from a
  manifest if an object is lost.
- **Secrets**: restore `APP_ENCRYPTION_KEY` from the secrets manager, then
  restore the Supabase backup. Without the key, encrypted rows are lost —
  re-run OAuth + re-enter provider keys.
- **Full rebuild**: fresh Supabase project → run all `phase*.sql` → set env →
  connect channel. Historical analytics are lost unless restored from backup.

## Known operational limits

- Analytics API and Data API have **separate** quotas; only Data API is gated.
- Cost figures are **estimates** (`costCalc.ts` rates), not billing-accurate.
- Viral/quality scores are LLM self-assessment until calibrated against real
  analytics.
