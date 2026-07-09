# API Documentation

> Routes are added per phase. This documents the planned surface; check
> `CONTINUE.md` for what is implemented.

## Auth

| Method | Route                             | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/api/auth/google`                | Start OAuth (offline, consent)       |
| GET    | `/api/auth/google/callback`       | Exchange code → store refresh token  |
| POST   | `/api/auth/refresh`               | Force token refresh                  |

## Pipeline (server actions preferred over REST)

| Action                | Input                     | Output                    |
|-----------------------|---------------------------|---------------------------|
| `discoverTopics()`    | sources[]                 | Topic[]                   |
| `rankTopics()`        | topicIds[]                | ranked Topic[]            |
| `generateScript()`    | topicId, language         | Script                    |
| `generateVoice()`     | scriptId, voiceId         | Voice                     |
| `renderVideo()`       | scriptId                  | Video (status: rendering) |
| `generateSeo()`       | scriptId                  | seo jsonb                 |
| `enqueueUpload()`     | videoId, publishAt        | Upload (status: queued)   |

## Worker

| Method | Route             | Auth                    | Description             |
|--------|-------------------|-------------------------|-------------------------|
| POST   | `/worker/render`  | `WORKER_SHARED_SECRET`  | Render a queued video   |
| POST   | `/worker/publish` | `WORKER_SHARED_SECRET`  | Upload approved video   |

## Conventions

- All authenticated routes rely on Supabase session (RLS enforces ownership).
- Errors return `{ error: string }` with an appropriate status code.
