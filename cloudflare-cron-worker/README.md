# Cloudflare Cron Worker

This directory contains a standalone Cloudflare Workers version of the cron trigger helper.

## What It Does

- Runs on a Cloudflare `Cron Trigger`
- Sends a `GET` request to your deployed `/api/cron`
- Optionally adds `Authorization: Bearer <CRON_SECRET>` if you configure `CRON_SECRET`
- Exposes `/run` for manual trigger testing after deployment
- Exposes `/` as a status page showing whether cron triggering is healthy

## Files

- `cloudflare-cron-worker/worker.js`: Worker entry with `fetch()` and `scheduled()` handlers
- `cloudflare-cron-worker/wrangler.toml`: Wrangler deployment config

## Required Config

Update `MONITOR_CRON_URL` in `cloudflare-cron-worker/wrangler.toml`:

```toml
[vars]
MONITOR_CRON_URL = "https://your-domain.example/api/cron"
```

If your `/api/cron` is protected, set the secret:

```bash
wrangler secret put CRON_SECRET
```

## Deploy

```bash
cd cloudflare-cron-worker
wrangler deploy
```

## Test

- Status page: `https://<your-worker-domain>/`
- Manual trigger: `https://<your-worker-domain>/run`
- Health check: `https://<your-worker-domain>/health`

## Default Schedule

The default schedule is once per minute:

```toml
[triggers]
crons = ["* * * * *"]
```

You can change it to any Cloudflare-supported cron expression.
