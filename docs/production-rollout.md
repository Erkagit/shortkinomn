# Subtitle studio rollout

## Local upload foundation

- Configure `FFMPEG_PATH` and `FFPROBE_PATH` in `apps/api/.env` with executable paths.
- Next's proxy buffer is 210 MB to accommodate a 200 MB video and multipart metadata.
  Multer still enforces the 200 MB file limit. The proxy buffers in memory;
  use direct object storage uploads before scaling concurrent large uploads.
- The studio checks media tools and live provider configuration before uploading.
- Browser smoke coverage includes a 16 MB multipart video upload, subtitle generation,
  preview and publication using isolated demo fixtures.

## Live provider verification (pending credentials)

Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` in the server environment, then set
`PROVIDER_MODE=live` and restart the API. Never put keys in `NEXT_PUBLIC_*` variables.
Run `npm run doctor`. This checks configuration presence, not provider access or quota.
Create a new job: jobs created in demo mode cannot be processed in live mode.
Verify transcription and translation on a short real clip, review timestamps and
Mongolian text, then generate and preview subtitles. Track provider request IDs and
actual usage. Do not treat demo smoke results as live quality validation.

Production startup refuses demo mode or missing provider keys.

## Remaining production work

1. Live validation of subtitle-specific translation instructions and readability/timing checks
   (implementation and local unit tests are in place).
2. Durable worker queue, restart recovery, bounded retries and idempotency.
3. Chunking and timestamp reassembly before raising the 180-second clip limit.
4. Object storage uploads, private media delivery, persistent database and backups.
5. Deployment host, domain, HTTPS, monitoring and provider spending limits.
6. Live end-to-end acceptance on representative content before public launch.

The deployment host, domain and storage account are not configured yet. Dubbing
code and endpoints remain intact; the web feature remains disabled.
