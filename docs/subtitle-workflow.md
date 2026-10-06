# Subtitle-first web workflow

The web currently publishes Mongolian subtitles with the original audio.
`apps/web/lib/features.ts` sets `dubbingEnabled` to `false`. Dubbing controls,
voice cloning, background audio controls and dubbed publishing are hidden;
their implementation and backend endpoints remain available for later use.
Existing published episodes and stored dubbing outputs are unchanged.

## API sequence

1. `POST /api/jobs`: upload the video and `episodeId`, with `background=none`
   and `outputMode=subtitles`. Legacy clients default to dubbing mode.
2. `POST /api/jobs/:id/prepare`: extract audio and transcribe speech.
3. `PATCH /api/jobs/:id`: save transcript corrections and transcript approval.
4. `POST /api/jobs/:id/translate`: translate into Mongolian.
5. `PATCH /api/jobs/:id`: save translation corrections and approval.
6. `POST /api/jobs/:id/subtitles`: prepare the original-audio MP4, SRT and VTT.
7. Preview the MP4 with its Mongolian VTT track, then approve publication.
8. `POST /api/admin/episodes/:id/publish`: explicitly send
   `{ jobId, version: "subtitles", approved: true }`.

Poll `GET /api/jobs/:id` for progress and output availability. Subtitle output
readiness is `outputs.subtitles`; `status=completed` belongs to the existing
dubbing workflow and is not required for subtitle publication.

The MP4 and subtitles are separate files. Download the Mongolian SRT alongside
the MP4 for offline use. Web playback loads the VTT track automatically.

Subtitle mode uses a separate translation prompt. Generated SRT and VTT wrap at
word boundaries. The editor shows saved-text warnings for more than two lines,
lines over 42 characters, reading speed over 20 characters/second, and overlapping
cues. These are editorial defaults requiring human review, not automatic rejection.
Start/end times can be edited; the backend validates the saved timeline.

Failed jobs retain their last action for an explicit retry. Cached provider results
are reused where available. This is not yet a durable multi-worker queue or an
exactly-once guarantee for paid provider requests.

Live transcription and translation continue using the existing providers;
new subtitle uploads do not request TTS, voice cloning or audio separation.
Demo mode uses sample text. Existing clip limits (200 MB, 2–180 seconds) apply.

To resume dubbing in the web, enable `dubbingEnabled` and validate both flows.
No dubbing code or stored content needs to be restored.
