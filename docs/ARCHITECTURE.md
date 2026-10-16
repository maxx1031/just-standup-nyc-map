# Architecture

## Request flow (one upload)

1. **Phone → server.** `POST /api/uploads` sends the video (`webapp/server.py`). The server stores it, creates an
   `upload` record in SurrealDB, and starts `run_job()` in a background thread. The phone polls
   `GET /api/uploads/{id}` every 2 s.
2. **Video prep.** `ffmpeg` converts phone HEVC `.mov` (with rotation metadata) into an upright 720p H.264 MP4 of at
   most 60 s.
3. **Planner sandbox.** `start_daytona()` creates an **ephemeral sandbox linked to the server** from the
   `standup-planner-<hash>` snapshot. Its env holds the job URL, a per-job token, a 30-minute Bedrock token and the
   Arize settings. Its entrypoint (`deploy/planner_boot.py`) downloads the planner code from the server over the
   **link network** (`http://<server-sandbox-id>:8080/internal/jobs/{id}/…`), then runs `standup_agent.worker`.
4. **Worker.** Fetches `/job` (settings plus the candidate exercises, exported from SurrealDB) and `/video`, runs
   `python -m standup_agent.run --plan_only`, and posts `out/` as a tar.gz to `/result`.
5. **Planner.** `standup_agent/run.py` → `reasoner.py`, about 10 Claude calls:
   * `analyze_scene`: objects plus what each affords (`seat`, `table_edge`, `wall`, `rail`, `step`, `floor_open`),
     then **code-enforced safety rules** (`OBJECT_RULES`, setting rules), each override logged as a GUARDRAIL span.
   * `plan`: Claude picks 3 exercises from the candidates. `_validate_plan` rejects made-up IDs, mismatched objects
     and repeated muscle groups, and fills any gap deterministically.
   * `choose_frame` / `best_frame` / `object_visible`: the best video frame showing each spot.
6. **Server.** Waits for `/result` (timeout 12 min), deletes the planner sandbox, writes the plan into SurrealDB
   (`save_plan`), and marks the upload `done`. The phone then gets the cards from `recommendations()`.

## SurrealDB (Cloud, `exrx/exrx`)

Read only (the scraped ExRx graph): `exercise` (1,865 records; `name`, `instructions`, `media`, `source_url`,
`search_text` with a full-text index, `embedding` with a 384-d HNSW index), `equipment`, `muscle`, `joint`, `uses`,
`works`, `moves`, `variation_of`.

Written by the app (`webapp/db.py`):

```
affordance ─suits→ exercise                      built at server start by seed(): full-text search over
                                                 search_text per affordance (short phrases; @@ needs every term),
                                                 bodyweight/stretch equipment only, must have a video, unsafe
                                                 names excluded (EXCLUDE list)
upload ─contains→ scene_object ─affords→ affordance
upload ─recommends→ exercise                     rank, object, why, safety, frame
demo_video                                       optional YouTube demo per exercise (webapp/demo_videos.py)
```

Useful queries (Surrealist):

```sql
SELECT * FROM upload ORDER BY created_at DESC LIMIT 5;
SELECT rank, object, out.name FROM recommends WHERE in = upload:<id> ORDER BY rank;
SELECT name, ->suits->exercise.name AS candidates FROM affordance;
```

To remove everything the app added: `REMOVE TABLE affordance; REMOVE TABLE suits; REMOVE TABLE upload;
REMOVE TABLE scene_object; REMOVE TABLE contains; REMOVE TABLE affords; REMOVE TABLE recommends;
REMOVE TABLE demo_video;`

## Tracing (Arize AX, optional)

`standup_agent/tracing.py` emits OpenTelemetry spans with OpenInference attributes. Spans: `handle_upload` (server)
→ `planner.daytona` → `plan_video` (planner sandbox, joined through `STANDUP_TRACEPARENT`) → `analyze_scene` /
`safety_guardrails` (GUARDRAIL) / `plan_exercises` / `plan_validation` (GUARDRAIL) / `vlm.generate` (LLM, with
images and token counts). Inside sandboxes, export goes over OTLP/HTTP, which the code sets up by hand because
`arize-otel` 0.14's `register()` crashes with the HTTP transport.

## Why it's built this way (Daytona Tier 1–2 constraints we measured)

| Finding | Consequence |
|---|---|
| Outbound traffic from sandboxes goes only to allowlisted hosts. Reachable: `bedrock-runtime.*.amazonaws.com`, `otlp.arize.com`, GitHub, PyPI, Daytona's API. Blocked: `bedrock-mantle.*.api.aws`, `*.daytonaproxy01.net` (preview URLs), `proxy.app.daytona.io`. `*.surreal.cloud` was blocked until Daytona enabled it for our org (new sandboxes only). | Claude goes through `AnthropicBedrock` on bedrock-runtime, not the Mantle endpoint. |
| A sandbox can create sandboxes through the API, but can't run commands or move files in them (the toolbox host is blocked). | The planner *pulls* its job from the server instead of being driven. |
| Linked sandboxes (private network to the parent) can't come from a declarative image build, only a snapshot. Our key can't create snapshots directly (403), but *snapshot from sandbox* works with the sandbox permission. | `deploy_daytona.py` builds the image into a builder sandbox, stops it, and snapshots it. |
| The key can't manage Daytona secrets (403). | Credentials go to the planner as env vars: a short-lived Bedrock token and the Arize key. |
| Python 3.14 sandboxes resolved `pip install daytona` to an old 0.134 that silently ignores `linked_sandbox`. | `daytona>=0.224.1` is pinned. |
