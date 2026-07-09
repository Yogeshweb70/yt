# SETUP

## 1. Prerequisites

- Node 22+, npm 10+
- A Supabase project
- A Google Cloud project with the **YouTube Data API v3** and
  **YouTube Analytics API** enabled
- API keys: OpenAI, ElevenLabs, News API, Reddit app; a Cloudflare R2 bucket

## 2. Environment

```bash
cp .env.example .env
```

Fill in every key. See `.env.example` for the full list.

## 3. Supabase

1. Create a project → copy the URL and anon/service keys into `.env`.
2. Open the SQL editor and paste the contents of `supabase/schema.sql`.
3. Confirm RLS is enabled on the listed tables.

## 4. Google OAuth (YouTube)

1. Google Cloud Console → **APIs & Services → OAuth consent screen**.
   - User type: External. Add your email as a test user.
   - Scopes: `youtube.upload`, `youtube.readonly`,
     `yt-analytics.readonly`.
2. **Credentials → Create OAuth client ID → Web application.**
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
     (and your production URL).
3. Copy client ID/secret into `.env`.

> The app requests `access_type=offline` and `prompt=consent` to obtain a
> **refresh token**. Store it; access tokens expire in ~1 hour.

## 5. Run

```bash
npm install
npm run dev
```

## 6. Render worker (Phase 2+)

The worker needs `ffmpeg` and Chromium. Locally, install ffmpeg and run via
`docker compose up worker`, or install both on the host.
