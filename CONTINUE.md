# CONTINUE.md — AI Shorts Studio Progress Tracker

> Single source of truth for build progress. Update after every work session.
> Resume rule: start from the first unchecked item in the earliest incomplete phase.

Last updated: 2026-07-09

---

## Reality checks (read before building)

- **YouTube upload quota**: default project quota is 10,000 units/day; each
  `videos.insert` costs ~1,600 units → **~6 uploads/day max** without a quota
  increase. "3 Shorts daily" fits, but leaves little headroom for retries.
- **Policy risk**: fully automated, mass-generated content can trigger
  YouTube's Spam & Deceptive Practices / Repetitious Content policies. Keep a
  human-review gate on the upload queue before enabling full autopilot.
- **OAuth refresh**: a "one-time connection" requires storing and rotating the
  **refresh token** (access tokens expire in ~1h). Handle `invalid_grant`.
- **Rendering cost**: Remotion + FFmpeg rendering is CPU/RAM heavy and cannot
  run on Vercel serverless (timeout + no ffmpeg). Needs a worker (container).

---

## Phase 0 — Foundation  ✅ complete

- [x] Master prompt captured (`AI_Shorts_Studio_Master_Prompt.md`)
- [x] `CONTINUE.md` created
- [x] `package.json`, `tsconfig.json`, `next.config.ts`
- [x] Tailwind v4 + global styles
- [x] App Router skeleton that boots (`app/layout.tsx`, `app/page.tsx`)
- [x] `.env.example` with all required keys
- [x] `.gitignore`
- [x] Supabase schema SQL (`supabase/schema.sql`)
- [x] Docker + docker-compose
- [x] GitHub Actions CI
- [x] README / SETUP / DEPLOY docs
- [x] `npm install` verified locally
- [x] `npm run build` verified locally (Next.js bumped to ^15.5.4 to clear a
      critical dev-server advisory; 2 moderate postcss dev-only advisories remain)

## Phase 1 — Auth & data layer  🟡 code-complete (needs live creds to exercise)

Mode: **single channel** + **full autopilot** (per user, 2026-07-09).

- [x] Supabase admin (service-role) client — `src/lib/supabase/admin.ts`
      (no browser client needed in single-channel mode)
- [x] Google OAuth flow — `src/lib/google/oauth.ts` + routes
      `/api/auth/google` and `/api/auth/google/callback`
      (scopes: youtube.upload, youtube.readonly, yt-analytics.readonly)
- [x] Token storage + auto-refresh — `src/lib/youtube/connection.ts`
      (`getValidAccessToken()` refreshes 60s before expiry; keeps old
      refresh_token when Google omits it; throws on `invalid_grant`)
- [x] Singleton connection table + RLS-enabled (service-role only access)
- [x] Typed DB access — `src/lib/supabase/types.ts` (hand-maintained until
      `supabase gen types` is run against the linked project)
- [x] Connect UI on `/dashboard` with status + one-time connect button
- [ ] **End-to-end OAuth verified with real Google + Supabase creds** ← blocked
      on `.env` values; code typechecks + builds but is not yet exercised live

## Phase 2 — AI Content Engine  🟡 code-complete (needs live API keys to exercise)

Produces a render-ready **Asset Manifest** per language. No rendering / upload
(those are later phases). Trigger: `POST /api/pipeline/run` (x-worker-secret).

Pipeline (each stage is an idempotent, resumable job in `jobs`):
discover → rank → research → [per lang: script → scenes+image_prompts →
voice+captions → seo → manifest]

- [x] Trend discovery — `src/services/trends.ts` (Google Trends RSS, Reddit,
      News API, RSS feeds; normalize + dedupe + categorize + persist)
- [x] Ranking engine — `src/services/ranking.ts` (trend/CTR/retention/
      competition/evergreen heuristics; auto-selects best topic)
- [x] Research — `src/services/content.ts::generateResearch`
- [x] Script generation EN + HI — `content.ts::generateScript`
- [x] Scene JSON + image prompts (Steps 5+6) — `content.ts::generateScenes`
- [x] Voice narration — `src/services/voice.ts` (ElevenLabs, stored in R2)
- [x] Subtitles SRT/VTT/word-timestamps — `src/services/captions.ts`
      (derived from ElevenLabs char alignment; **unit-verified**, no Whisper needed)
- [x] SEO metadata + thumbnail prompt — `content.ts::generateSeo`, `prompts`
- [x] Asset Manifest assembly (Step 9) — `src/services/manifest.ts`
- [x] Background jobs: retry / resume / idempotent — `src/services/jobs.ts`
- [x] Orchestrator — `src/services/pipeline.ts`; route `/api/pipeline/run`
- [x] Migration `supabase/phase2.sql` (additive; new tables: research, scenes,
      captions, asset_manifests, jobs)
- [ ] **Live end-to-end run** ← needs OPENAI_API_KEY, ELEVENLABS_API_KEY +
      voice ids, R2 creds, (optional) NEWS_API_KEY/RSS_FEEDS. Code typechecks +
      builds; caption logic unit-tested.

### Deferred to later phases (were listed here, belong elsewhere)

- [ ] Image generation from prompts (render/asset phase)
- [ ] Remotion composition 1080x1920 (Phase: renderer)
- [ ] FFmpeg mux + render worker (Phase: renderer)

## Phase 3 — Video Generation Engine  🟡 code-complete + render-verified

Consumes an existing Asset Manifest (never regenerates script/seo/captions/
voice). Output: 1080x1920 H264 MP4 @ 60fps + thumbnail, uploaded to R2.
Trigger: `POST /api/render/run { manifestId }` (x-worker-secret).
**Must run on the worker container (ffmpeg + chromium), not Vercel.**

- [x] Remotion project — `src/remotion/` (index, Root, Short, Thumbnail)
- [x] Scene component (image/video/text/motion/gradient) — `components/Scene.tsx`
- [x] Motion system (fade/zoom/pan/slide/scale/rotate/parallax/blur) — `motion.ts`
- [x] Animated word-highlight captions (auto-wrap) — `components/Captions.tsx`
- [x] Voice sync — scenes scaled to fill narration duration (`ShortVideo.tsx`)
- [x] Background music with ducking + fade in/out (opt-in via MUSIC_URL)
- [x] Sound-effect hook (frame-positioned, opt-in)
- [x] Scene image generation from imagePrompts — `src/services/images.ts`
      (OpenAI dall-e-3 → R2; idempotent, reused across re-renders)
- [x] Thumbnail render from thumbnailPrompt — `Thumbnail.tsx` + images svc
- [x] FFmpeg export h264 60fps 12M bitrate — `src/services/render.ts` (renderMedia)
- [x] R2 upload of video + thumbnail; `videos` row persisted
- [x] Jobs: images + render stages (retry/resume/idempotent via `jobs`)
- [x] Migration `supabase/phase3.sql` (images.scene_number)
- [x] **VERIFIED offline**: `remotion compositions` lists Short(60fps,1080x1920)
      + Thumbnail; rendered a real 1080x1920 still — scene motion + animated
      captions paint correctly (fixed: empty-audio crash guard; active-word
      scale collision)
- [ ] Full MP4 render with live OpenAI/ElevenLabs/R2 creds on the worker box

### Deferred / notes

- Music & SFX need royalty-free asset URLs supplied via env/DB (none bundled).
- Real audio-sidechain ducking is post-Phase; current ducking is a fixed low
  music bed with fades.

## Phase 4 — YouTube Automation Engine  🟡 code-complete (needs live channel to exercise)

Uploads rendered videos to YouTube automatically. Reuses Phase-1 OAuth
(`getValidAccessToken` auto-refresh). Triggers (x-worker-secret):
`POST /api/upload/run {videoId}` and `POST /api/autopilot/run {manifestId}`
(render + publish). Runs on the worker container.

- [x] Upload service (YouTube Data API v3, resumable) — `src/services/youtube/api.ts`
      (video insert + thumbnail set + playlist add; error classification)
- [x] Metadata from Phase-2 SEO — `publish.ts::buildMetadata` (title/desc/tags/
      category/language/madeForKids/license; tag-length + title/desc caps)
- [x] Scheduling: immediate / scheduled (publishAt→private-until) / private /
      unlisted — via PublishOptions + env
- [x] Playlist auto-add (YOUTUBE_PLAYLIST_ID) — best-effort, non-fatal
- [x] Thumbnail upload with retry (Step 5)
- [x] Upload status tracking: queued→uploading→processing→published / failed /
      retrying — `uploads` table (upsert-by-video_id)
- [x] Retry logic — token refresh (upstream), QuotaError, NonRetryableError
      (invalid metadata → no retry), network → job retry/resume
- [x] Quota manager — `src/services/quota.ts` + `api_quota` table (reserves
      1600/insert, 50/thumb, 50/playlist against daily limit; blocks when full)
- [x] Publishing worker — `publish.ts` (idempotent: skips if youtube_id exists;
      resumable via jobs) ; autopilot orchestrator `src/services/autopilot.ts`
- [x] History fields (video id, channel, published url, thumb, duration,
      publish time, status, retry count) — `uploads` (phase4.sql)
- [x] Additive migration `supabase/phase4.sql`; typecheck + build green
- [ ] **Live upload verified** ← needs a connected YouTube channel (Phase-1
      OAuth completed) + youtube.upload scope approved on the OAuth app.
      Cannot be exercised without real creds; API request shapes follow Data
      API v3 resumable spec but are unproven against the live endpoint.

### Autopilot / scheduling note

- `autopilot.runManifestToYouTube` chains render→publish. The daily "3 Shorts"
  cadence = a cron hitting `/api/autopilot/run` 3× with selected manifests
  (Phase 5/cron wiring, not built). Full-autopilot default publishes public
  immediately; set YOUTUBE_PUBLISH_AT / privacy to stage instead.
- ⚠️ Quota reality: default 10k units/day ≈ 6 uploads. 3/day fits with headroom
  for retries; a burst of failed-retry inserts can still exhaust it.

## Phase 5 — AI Creative & Quality Optimization  🟡 code-complete + UI-verified

Inserted between **render → upload** (autopilot chain: render → **optimize** →
publish). Generates + scores creative variants, runs a viral-score quality gate
(≤3 cycles), and writes winners back into `asset_manifests.manifest.seo` +
`videos.thumbnail_url` so the **unmodified** publisher uploads the best version.

- [x] Hook optimizer — 5 hooks scored (curiosity/retention/attention), best chosen
- [x] Title generator — 10 titles scored (ctr/intent/length/readability/uniqueness)
- [x] Description generator — 3 scored (seo/keywords/natural/cta)
- [x] Hashtags (deduped, non-spam) + keyword tiers (primary/secondary/longtail)
- [x] Thumbnail prompts — 5 distinct strategies (curiosity/shock/question/
      numbers/contrast) — `src/services/creative.ts`
- [x] Thumbnail generation — reuses `generateImage` → R2 (5 variants)
- [x] Thumbnail scoring — GPT-4o **vision** (clarity/face/contrast/readability/
      ctr) via new `openai.visionJSON`
- [x] Quality scores hook/script/caption/scene/voice + overall viral (0-100) —
      single combined analysis call (token-efficient)
- [x] Quality gate — improve hook/title/description + re-score, max 3 cycles,
      early-stop if no gain — `src/services/optimize.ts`
- [x] Creative report — scores/reasons/selected/rejected/winner persisted
- [x] Migration `supabase/phase5.sql` (creative_scores, title_variants,
      thumbnail_variants, quality_reports)
- [x] Jobs: single idempotent/resumable `optimize` stage (keyed by videoId)
- [x] Creative Dashboard — score, thumbnail comparison, title comparison,
      optimization history — `/dashboard/creative` (**rendered + verified**)
- [x] Autopilot updated to insert optimize between render and publish
- [x] typecheck + build green
- [ ] **Live run** ← needs OpenAI (chat+image+vision) + R2 creds

### Known limitations / decisions

- **Hook optimization is post-render**, so the winning hook cannot change the
  already-rendered narration audio. It's stored in the report and steers the
  title/description only. To optimize the *spoken* hook, this stage would need
  to move before render (future: pre-render creative pass).
- **Cost driver**: `THUMBNAIL_VARIANTS` (default 5) means 5 image-gen calls plus
  1 vision call per video, on top of ~4 chat calls and up to 3 gate cycles (2
  calls each). Tune down via env if budget-constrained.
- Thumbnail regeneration is NOT repeated inside gate cycles (cost) — gate
  improves text only; best thumbnail is chosen once from the initial 5.

## Phase 6 — Analytics & Self-Learning  🟡 code-complete (calc unit-tested + UI verified)

Closes the loop: sync YouTube performance → history → health/predictions →
recommendations → learning model. Cron-triggered workers (x-worker-secret):
`POST /api/analytics/sync` (daily), `/api/analytics/learn` (weekly),
`/api/reports/generate {period}` (daily/weekly/monthly).

- [x] Analytics sync worker — `src/services/analytics/sync.ts`
      (Data API stats + Analytics API core/traffic/search + retention;
      per-day cache, graceful per-video degradation)
- [x] Append-only history — `analytics_snapshots` (unique video+date) +
      `video_metrics` latest upsert (Steps 1-2)
- [x] Retention analysis → scene drop-off — `retention_reports` (Step 3)
- [x] **Pure calc layer + UNIT TESTS (13/13 pass)** — `analytics/calc.ts`
      (engagement, completion, growth, trend, consistency, channelHealth,
      predictFromHistory, retentionDropoff) — `calc.test.ts`
- [x] Topic/publishing intelligence + learning model — `insights.ts::runLearning`
      (versioned `learning_models`; does NOT overwrite manual prompts) (Steps 5,6,8)
- [x] Recommendation engine (AI) — `insights.ts::generateRecommendations` (Step 7)
- [x] Performance prediction — data-driven baseline + confidence (Step 9)
- [x] Channel health — `channel_health` from calc layer (Step 10)
- [x] Reports daily/weekly/monthly — `report.ts` (Step 12)
- [x] Notifications (ctr/retention drop, quota low, top performer, recs) —
      `notify.ts` + optional NOTIFY_WEBHOOK_URL (Step 13)
- [x] Caching + quota reuse (per-day snapshot guard; reuses `quota.ts`) (Step 16)
- [x] Jobs: analytics_sync + report stages (idempotent/resumable) (Step 15)
- [x] Dashboard `/dashboard/analytics` (health tiles, top/worst, recs) —
      **rendered + verified** (Step 11 overview)
- [x] Migration `supabase/phase6.sql` (10 additive tables); typecheck + build green
- [ ] **Live sync verified** ← needs published videos + Analytics API access
- [ ] Learning is stored but NOT yet wired back into Phase-2 ranking / prompts
      (see note)

### Scope decisions / limitations

- **Dashboard is one overview page, not 10 separate pages.** Retention/CTR/
  traffic/search each have stored data; surfacing them is additional UI only.
- **Learning is open-loop for now.** `learning_models` captures top categories,
  best publish hour/day, and prediction baselines, but Phase-2 `ranking.ts` and
  the prompt files are NOT auto-modified (spec: "never overwrite manual
  prompts"). Wiring ranking to read the latest model is a deliberate opt-in
  next step — flagged so the "self-learning" claim isn't overstated.
- **Predictions/scores are heuristic + LLM**, not trained models. Confidence =
  sample-size proxy. Calibrate against real analytics before trusting.
- YouTube **Analytics API uses a separate quota** from the Data API 10k budget;
  we log usage but only reserve the 1-unit Data API stat call.

## Phase 4 — Analytics & feedback loop  ⬜ not started

- [ ] YouTube Analytics ingestion
- [ ] Metrics dashboard
- [ ] Feedback → topic/script tuning

## Phase 7 — Production Platform & Orchestration  🟡 core built + unit-tested

Replaces long-request execution with a **durable queue**. `queue_jobs` is
separate from `jobs` (jobs = per-service idempotency; queue_jobs = orchestration).
Scheduler (`scripts/worker-loop.mjs`) ticks `/api/queue/tick` + dispatches daily.

- [x] Durable queue — `src/services/queue/queue.ts` (enqueue, optimistic claim,
      complete, fail+backoff, DLQ, cancel, progress, deps, priority, scheduling,
      idempotency)
- [x] Pure queue logic **unit-tested (12/12)** — `queue/backoff.ts` + test
- [x] Generic worker + handler registry — `queue/worker.ts`, `queue/handlers.ts`
      (logical workers: one process serves all types, or restrict `types` per
      deployment; reuses existing phase services unchanged)
- [x] Pipeline manager — `src/services/pipelineManager.ts` (daily DAG:
      content→fan-out autopilot per manifest; analytics→report)
- [x] System health — `src/services/systemHealth.ts` (queue depth, DLQ, db,
      quota, cost, oldest-pending) + `/api/system/health`
- [x] Cost tracking — `costCalc.ts` (pure, **unit-tested 6/6**) + `cost.ts`
      (record/summary); per-video estimate; daily/weekly/monthly on dashboard
- [x] Routes: `/api/queue/tick`, `/api/queue/dispatch`, `/api/health` (public
      liveness), `/api/system/health`
- [x] Dashboard `/dashboard/system` (queue, DLQ, cost, alerts) — **verified**
- [x] Deployment: `Dockerfile.worker` runs full app (ffmpeg+chromium),
      `docker-compose` adds healthchecks + scheduler service; `validate-env.mjs`
- [x] `npm test` runs all 31 analytics/queue/cost unit tests; typecheck+build green
- [x] Migration `supabase/phase7.sql` (queue_jobs, cost_entries, api_usage,
      system_health, alerts)

### ⚠️ Deliberately DEFERRED (not built — would be shallow or needs decisions)

- **Multi-channel (Step 8)** — conflicts with the locked Phase-1 "single
  channel" decision. `queue_jobs.channel_id` exists (nullable) for readiness,
  but retrofitting channel scoping across every table/service is a large change
  that contradicts a prior decision. **Needs user decision before building.**
- **Sentry / OpenTelemetry (Step 10)** — `SENTRY_DSN` env stub only; real SDK
  wiring is a TODO. Structured logs already exist via `logger`.
- **Credential encryption + token rotation + rate limiting + audit logs
  (Step 12)** — OAuth refresh works (Phase 1); tokens are stored PLAINTEXT in
  Supabase. Encryption-at-rest and route rate limiting are NOT implemented.
- **Integration / e2e / worker / retry tests (Step 13)** — only pure-unit tests
  exist (31). End-to-end needs live creds + a test channel.
- **Per-provider quota pause for OpenAI/ElevenLabs/News/Reddit/Trends (Step 7)**
  — `api_usage` table exists; only YouTube Data quota is actively enforced
  (Phase 4 `quota.ts`). Others are trackable but not yet gating jobs.
- **Cost recording is not yet wired into the services** — `recordCost` exists
  and `estimateVideoCost` is tested, but individual service calls don't emit
  cost entries yet (would modify completed phases). Opt-in wiring pending.

### ✅ RESOLVED — multi-video/day (was the pre-existing core gap)

- `ranking.rankAndSelectTopics(n)` selects top-N **distinct** topics (greedy by
  category for diversity + rank backfill); pure picker `rankingSelect.ts`
  **unit-tested (6/6)**. `pipeline.runPipeline` now loops selected topics
  (per-topic failure isolated) → manifests for each. `DAILY_TOPIC_COUNT` env
  (default 3). Autopilot fan-out already enqueues one job per manifest.
- ⚠️ Total uploads = `DAILY_TOPIC_COUNT` × languages. Default 3 × (en,hi) = 6 ≈
  YouTube daily quota ceiling — set `DAILY_TOPIC_COUNT=3` with one language, or
  accept 6, or raise the quota. Decision left to operator via env.
- Single-channel confirmed (user, 2026-07-09) — multi-channel stays deferred.

## Phase 9 — Production Validation & Reliability  🟢 verified where it counts

No new features. Added a real test runner (vitest) that resolves `@/` + stubs
`server-only`, plus an in-memory fake DB, so the ACTUAL orchestration code is
now tested — not a re-implementation.

- [x] **Reliability tests exercise real code (9/9 green)** —
      `tests/queue.recovery.test.ts` + `tests/jobs.idempotency.test.ts` cover:
      claim→run→complete, transient-failure retry+recover, dead-letter after
      max attempts, enqueue idempotency, dependency gating, crash-safe lock
      guard (no double-claim), runStage cache/resume/exhaustion. (Steps 1,2,7)
- [x] Test infra: `vitest.config.ts` (alias + `test.env` backoff=0),
      `tests/support/fakeSupabase.ts` (in-memory chainable client mirroring DB
      defaults), `admin.__setSupabaseClientForTests` seam.
- [x] Failure simulation (Step 2) modeled as handler-throw → verified queue
      retries transient + dead-letters permanent. (Live API fault injection
      still needs creds; the recovery MACHINERY is proven.)
- [x] Observability (Step 6) — `src/lib/trace.ts` `withSpan` (duration +
      structured log + `traces` row), wired into worker dispatch;
      `/api/health` liveness (Phase 7).
- [x] Cost validation (Step 4) — `cost.perVideoCost` + `costSummary`
      daily/weekly/monthly on `/dashboard/system`.
- [x] Operational dashboard (Step 9) — `/dashboard/ops`: success rate,
      completed/dead/in-flight, p50/p95 latency per operation. **Verified render.**
- [x] Deployment checklist + rollback + DR + monitoring + runbook (Step 10) —
      `RUNBOOK.md`.
- [x] Migration `supabase/phase9.sql` (traces); `npm test` = 54 tests
      (5 unit suites + 9 reliability) green; typecheck + build green.

### Honest limits of this phase

- **Stress testing (Step 3)** not executed — needs a live/staging env with real
  external services and concurrent load; the queue supports concurrency + limits
  but throughput under real load is unmeasured.
- **Live failure injection & performance profiling (Step 5)** against real
  OpenAI/ElevenLabs/R2/YouTube still require credentials; traces will populate
  `/dashboard/ops` once the pipeline runs live.
- Recovery is proven at the **orchestration layer** (queue/jobs). A given
  service handler's own resilience is only as good as its internal error
  handling (mostly try/catch + throw-to-retry, which the queue then recovers).

## Phase 8 — Security & Config (additive, tenant-neutral)  🟡 core built + tested

Decision (user, 2026-07-09): **stay single-channel, NOT commercializing** →
built the valuable tenant-neutral subset of the "Enterprise SaaS" prompt;
multi-tenancy / RBAC / Stripe billing / public-API-for-others intentionally
**NOT built** (would reverse the single-channel decision + rewrite Phases 1-7).

- [x] **Credential encryption (Steps 5/15)** — `src/lib/crypto.ts` AES-256-GCM,
      **unit-tested 8/8** (roundtrip, random IV, tamper detection, legacy
      passthrough). Keyed by `APP_ENCRYPTION_KEY`.
- [x] **OAuth tokens now encrypted at rest** — `connection.ts` encrypts on
      save/refresh, decrypts on read, backward-compatible (closes the #1
      flagged production risk: plaintext tokens).
- [x] API-key vault — `src/services/secrets.ts` (encrypted per-provider creds +
      env fallback + liveness validation) ; `POST /api/secrets` (validates
      before storing)
- [x] Template system (Step 8) — `src/services/templates.ts` (kinds + active
      selection; opt-in — generation still defaults to built-in prompts)
- [x] Prompt versioning (Step 10) — `promptVersions.ts` (create/activate/
      rollback/getActive; performance field for A/B)
- [x] Brand settings (Step 9) — `brand.ts` singleton (fonts/colors/logo/intro/
      outro/watermark/music/voice)
- [x] Webhooks (Step 12) — `webhooks.ts` (register + HMAC-signed emit +
      delivery log); wired into the Phase-7 worker for render/publish/analytics/
      error events
- [x] Audit logs (Step 14) — `audit.ts`; recorded on secret/template/prompt/
      brand mutations
- [x] Settings dashboard `/dashboard/settings` (masked creds, webhooks, audit) —
      **rendered + verified**
- [x] Migration `supabase/phase8.sql` (7 tables); `npm test` = 45 tests green;
      typecheck + build green

### NOT built (needs the multi-tenant decision the user declined)

- Multi-tenancy / orgs / workspaces (Step 1), RBAC (Step 2), Stripe billing
  (Step 3), team management (Step 6), per-user channel management (Step 7),
  public API for third parties (Step 11), global admin console for other orgs
  (Step 13). Deferred by decision — revisit only if commercializing.
- GDPR export/deletion (Step 17), automated DB backups/DR (Step 16): operational
  — Supabase provides managed backups; data-export/delete is a small additive
  task if ever needed.
- Rate limiting / CSRF / session mgmt (Step 15): routes are secret-protected and
  OAuth uses a state cookie; app-level rate limiting not added (single-operator).

### Opt-in wiring still pending (additive services exist, not yet consumed)

- Templates / prompt versions are stored but generation (`content.ts`,
  `src/prompts`) still uses built-ins — wiring is a deliberate opt-in to avoid
  modifying Phase-2 behavior.
- Brand `music_url` duplicates the render `MUSIC_URL` env — unify when wiring
  brand into render.
- `secrets.getSecret` exists but services still read raw env — migrate provider
  reads to the vault when ready.

---

## Decisions log

- 2026-07-09: Render worker will run as a separate container (not Vercel fn).
- 2026-07-09: **Single-channel mode** chosen — one connected channel, tokens in
  a singleton `youtube_connection` row accessed via service role. Multi-tenant
  `user_id`/RLS tables remain in the schema for a future upgrade path.
- 2026-07-09: **Full autopilot** chosen by user. The `uploads.status` still has
  a `queued → approved` path; autopilot auto-approves. ⚠️ Risk: unattended
  mass-upload is the top cause of channel strikes — revisit if strikes appear.

## Open questions for the user

1. Autopilot vs human-in-the-loop for uploads at launch?
2. Single YouTube channel, or multi-tenant SaaS (many users' channels)?
3. Budget ceiling for OpenAI + ElevenLabs per day (drives model/voice choice)?
