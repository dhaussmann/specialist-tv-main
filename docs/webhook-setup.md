# 🎣 Cloudflare Stream Webhooks Setup Guide

This guide shows you how to properly configure Cloudflare Stream webhooks for your video processing pipeline.

## 📋 Overview

Cloudflare Stream webhooks notify your application when:
- Videos finish processing and are ready to stream
- Videos enter an error state
- Processing progress updates occur

## 🚀 Quick Setup

### 1. **Deploy Your Worker**

First, deploy your worker to get the webhook URL:

```bash
npm run deploy
```

Your webhook endpoint will be: `https://your-worker-name.your-subdomain.workers.dev/stream/webhook`

### 2. **Configure Webhook URL**

Use the setup script to register your webhook:

```bash
# Set environment variables
export STREAM_ACCOUNT_ID="your-cloudflare-account-id"
export STREAM_API_TOKEN="your-stream-api-token"
export WEBHOOK_URL="https://your-worker-name.your-subdomain.workers.dev/stream/webhook"

# Run setup script
node scripts/setup-webhook.js
```

### 3. **Save Webhook Secret**

The setup script will return a webhook secret. Save it as an environment variable:

```bash
wrangler secret put WEBHOOK_SECRET
# Enter the secret when prompted
```

## 🔧 Manual Configuration

You can also configure webhooks manually using the Cloudflare API:

```bash
curl -X PUT \
  --header "Authorization: Bearer YOUR_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/stream/webhook" \
  --data '{"notificationUrl":"https://your-worker.workers.dev/stream/webhook"}'
```

## 📨 Webhook Payload Format

Cloudflare Stream sends webhooks with this format:

```json
{
  "uid": "dd5d531a12de0c724bd1275a3b2bc9c6",
  "readyToStream": true,
  "status": {
    "state": "ready",
    "pctComplete": "100"
  },
  "meta": {},
  "created": "2019-01-01T01:00:00.474936Z",
  "modified": "2019-01-01T01:02:21.076571Z"
}
```

### Status States

- `pendingupload` - Video is waiting to be uploaded
- `downloading` - Video is being downloaded/ingested
- `queued` - Video is queued for processing
- `inprogress` - Video is currently being processed
- `ready` - Video is ready to stream
- `error` - Video processing failed

## 🔐 Security Features

### Signature Verification

All webhooks are signed with HMAC-SHA256. The signature is included in the `Webhook-Signature` header:

```
Webhook-Signature: time=1230811200,sig1=60493ec9388b44585a29543bcf0de62e377d4da393246a8b1c901d0e3e672404
```

### Timestamp Validation

Webhooks older than 5 minutes are automatically rejected to prevent replay attacks.

### Constant-Time Comparison

Signature verification uses constant-time comparison to prevent timing attacks.

## 🔄 Processing Pipeline

When a webhook is received:

1. **Signature Verification** - Validates the webhook is from Cloudflare
2. **Database Lookup** - Finds the video by `stream_id`
3. **Status Sync** - Updates video status from Stream API
4. **Pipeline Trigger** - Starts processing (transcription → tagging → chapters) when ready

## 🐛 Debugging

### Check Webhook Configuration

```bash
curl -X GET \
  --header "Authorization: Bearer YOUR_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/stream/webhook"
```

### View Webhook Logs

```bash
wrangler tail --format pretty
```

### Test Webhook Endpoint

```bash
curl -X POST https://your-worker.workers.dev/stream/webhook \
  -H "Content-Type: application/json" \
  -d '{"uid":"test","status":{"state":"ready"}}'
```

## 🚨 Troubleshooting

### Common Issues

1. **Webhook not receiving requests**
   - Check webhook URL is correct
   - Ensure worker is deployed
   - Verify webhook is registered with Cloudflare

2. **Signature verification failing**
   - Check `WEBHOOK_SECRET` is set correctly
   - Verify webhook secret matches Cloudflare's

3. **Videos stuck in processing**
   - Check webhook endpoint is accessible
   - Enable fallback polling (already implemented)
   - Check Stream API credentials

### Fallback Mechanism

If webhooks fail, the system automatically:
- Polls Stream API every 10 seconds for processing videos
- Syncs status and triggers processing pipeline
- Provides manual sync endpoint: `POST /api/videos/sync`

## 📚 References

- [Cloudflare Stream Webhooks Documentation](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/)
- [Stream API Reference](https://developers.cloudflare.com/api/operations/stream-videos-list-videos)
- [HMAC Signature Verification](https://en.wikipedia.org/wiki/HMAC)
