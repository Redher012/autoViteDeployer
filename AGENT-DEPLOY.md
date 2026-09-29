# Agent Deploy API

Instructions for a deployer agent that creates hosted previews and pushes corrections onto the same preview URL.

## Purpose

Use this API to:

1. **Deploy** a new Vite/Next project zip and get a hosted preview (`id` + `url`).
2. **Redeploy** a corrected zip onto that same deployment so the public URL stays the same.

Do not create a second deployment when you only need to update an existing preview.

## Base URL

The deployer origin. For local development with `npm run dev`:

```
http://localhost:3000
```

In production, use the real deployer host.

## Auth

Every agent request must send:

```
Authorization: Bearer <AGENT_API_KEY>
```

`AGENT_API_KEY` is configured on the server (environment variable). It must not be committed to the repo. Do not put the key in query strings or logs.

Dashboard cookie login (`auth_token`) does not authorize these routes. Do not call `/api/auth/login` for agent deploy work.

If the server has no `AGENT_API_KEY` set, agent routes return **503**.

## Endpoints

### 1. Create a deployment

`POST /api/agent/deploy`

Multipart form fields:

| Field | Required | Notes |
|-------|----------|--------|
| `file` | yes | Zip archive |
| `siteName` | no | Defaults to `Untitled Site` |

Success **200**:

```json
{
  "success": true,
  "deployment": {
    "id": "<uuid>",
    "siteName": "...",
    "subdomain": "...",
    "port": 3001,
    "status": "running",
    "url": "http://localhost:3001"
  }
}
```

Store `deployment.id` and `deployment.url`. Later corrections must use that `id`.

Errors:

| Status | When |
|--------|------|
| 400 | Missing `file` |
| 401 | Missing/invalid bearer token |
| 500 | Deploy/build failure |
| 503 | `AGENT_API_KEY` not configured |

### 2. Redeploy onto the same preview

`POST /api/agent/deployments/:id/redeploy`

Multipart form fields:

| Field | Required | Notes |
|-------|----------|--------|
| `file` | yes | New zip |

Do not send a new site name. Redeploy keeps `id`, `subdomain`, `site_name`, and `created_at`. It replaces extracted files, `node_modules`, build output, the preview process, and the screenshot.

When `DEPLOYMENT_DOMAIN` is set, the public URL stays `https://<subdomain>.<DEPLOYMENT_DOMAIN>`. Store that URL. The `port` field can change on each redeploy; that does not mean a new site. Without `DEPLOYMENT_DOMAIN`, `url` is `http://localhost:<port>` and the port in that URL may change. Identity is `id` and `subdomain`, not the port.

Success **200**: same shape as deploy (`success` + `deployment` with the **same** `id` and `subdomain`).

If this call returns **500**, the previous files are already replaced and the same row is `failed`. Read it with GET, fix the zip, and POST redeploy again to the same `id`. Do not create a new deployment to recover.

Errors:

| Status | When |
|--------|------|
| 400 | Missing `file` |
| 401 | Missing/invalid bearer token |
| 404 | Unknown `id` (nothing is created) |
| 500 | Install/build/preview failure (same row kept with status `failed` and `error_log`; no second row) |
| 503 | `AGENT_API_KEY` not configured |

### 3. Read a deployment

`GET /api/agent/deployments/:id`

Use this to confirm status after a failed call or to poll outcome.

Success **200**:

```json
{
  "deployment": {
    "id": "...",
    "site_name": "...",
    "subdomain": "...",
    "status": "running",
    "port": 3001,
    "url": "http://localhost:3001",
    "updated_at": "...",
    "error_log": null
  }
}
```

Errors: **401**, **404**, **503**, **500**.

## Zip contents

Same rules as the dashboard product: a `dist` folder (pre-built), or a full Vite/Next project with `package.json`. See the project [README.md](./README.md) for upload/format details. Do not invent new archive layouts.

## Curl examples

Deploy:

```bash
curl -X POST "http://localhost:3000/api/agent/deploy" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -F "file=@/path/to/project.zip" \
  -F "siteName=My Preview"
```

Redeploy (same id / URL host):

```bash
curl -X POST "http://localhost:3000/api/agent/deployments/<deployment-id>/redeploy" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -F "file=@/path/to/corrected.zip"
```

## What you must not do

- Do not create a second deployment to “update” a site — call redeploy with the stored `id`.
- Do not use dashboard cookie login for these endpoints.
- Do not delete a deployment just to redeploy.
- Do not put `AGENT_API_KEY` in query strings, URLs, or logs.
