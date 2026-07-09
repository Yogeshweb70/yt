# DEPLOY

Two deploy targets because rendering cannot run on serverless.

## Web (Vercel)

1. Import the repo into Vercel.
2. Add all `.env` vars (except worker-only ones) as Project Environment
   Variables.
3. Set `GOOGLE_OAUTH_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` to the
   production domain, and add the redirect URI in Google Cloud.
4. Deploy. Vercel runs `npm run build` automatically.

## Worker (container host)

Remotion + FFmpeg need a long-running container with CPU/RAM — use Fly.io,
Railway, Render, or a VM. **Do not** put this on Vercel functions.

```bash
docker build -f Dockerfile.worker -t ai-shorts-worker .
docker run --env-file .env ai-shorts-worker
```

Or run the whole stack locally:

```bash
docker compose up --build
```

## Scheduling

The "3 Shorts/day" scheduler can run as:

- a cron trigger hitting an authenticated route on the web app, or
- a loop inside the worker container.

Keep the **human-review gate** on the upload queue until autopilot is proven,
to stay within YouTube's spam/repetitious-content policies.

## CI/CD

`.github/workflows/ci.yml` runs typecheck + build on every push/PR. Add a
deploy job (Vercel action / container registry push) once secrets are set.
