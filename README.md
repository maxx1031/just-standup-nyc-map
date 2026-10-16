# just-stand-up

Film your workspace on your phone and get three safe exercises that use what's around you: a chair, a desk edge,
a railing, a step, open floor.

## How it works

```
phone ──QR / URL──▶ web app (Daytona sandbox, public preview URL)
                     │  1. reads candidate exercises from SurrealDB Cloud (ExRx graph)
                     │  2. starts a fresh, linked, single-use Daytona sandbox for this upload
                     ▼
              planner sandbox ── Claude on Amazon Bedrock: what's in the scene, what each object safely
                     │            affords, which 3 exercises fit (code-enforced safety rules on top)
                     ▼
              results ──▶ SurrealDB Cloud as a graph ──▶ 3 cards on the phone (spot photo, why, safety,
                                                                             ExRx steps + video link)
```

* **Daytona.** The web app runs in a long-running sandbox. Each upload is planned in its own ephemeral sandbox,
  linked to the server on a private network, so the office footage never leaves that sandbox, which is deleted
  afterwards. The planner sandbox starts from a snapshot whose entrypoint pulls its code and job from the server.
* **Claude on Bedrock.** `standup_agent/reasoner.py` (`BedrockVLM`), using `global.anthropic.claude-opus-5-5`, with
  a fallback to Opus 4.8 if a request is declined.
* **SurrealDB.** The ExRx graph (`exercise`, `equipment`, `muscle`, `uses`, `works`, …) is only read. The app adds:
  `affordance ─suits→ exercise` (full-text search, bodyweight exercises with a video only), and per upload
  `upload ─contains→ scene_object ─affords→ affordance` and `upload ─recommends→ exercise`.
* **Arize (optional).** Every VLM call, every safety-rule override (GUARDRAIL spans) and every sandbox step is
  traced, and one trace covers the server and the planner sandbox.

**New here? Start with [`ONBOARDING.md`](ONBOARDING.md).** More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SPONSORS.md`](docs/SPONSORS.md).

## Layout

| Path | What |
|---|---|
| `webapp/server.py` | FastAPI app: phone page, uploads, job runner, the internal endpoints the planner sandbox calls |
| `webapp/db.py` | SurrealDB: candidates from the ExRx graph, writing and reading results |
| `webapp/index.html` | the phone page (record video → progress → 3 cards) |
| `webapp/demo_videos.py` | optional playable YouTube demos per exercise (ExRx's own videos only play on exrx.net) |
| `standup_agent/reasoner.py` | scene analysis, safety rules, exercise choice, frame choice |
| `standup_agent/run.py` | the planner CLI (`--plan_only`); the video-generation paths are unused here |
| `standup_agent/worker.py` | runs inside the planner sandbox: fetch job → plan → post result |
| `standup_agent/tracing.py` | Arize / OpenTelemetry spans |
| `standup_agent/daytona_runner.py` | one-off: plan a local video in a throwaway sandbox from your machine |
| `deploy/deploy_daytona.py` | build the planner snapshot, create/update the server sandbox, print a QR |
| `scripts/smoke_test.sh` | upload `samples/office.mp4` to a running app and print the result |
| `config/surreal.env` | shared SurrealDB Cloud test login (committed on purpose; private repo) |
| `docs/reference/01_UI.html` | the approved UI design (open in a browser) |

## Deploy

```bash
pip install -r requirements.txt
cp .env.example .env    # fill it in
set -a; source .env; source config/surreal.env; set +a

python deploy/deploy_daytona.py up              # first time: builds the planner snapshot (~2 min), prints URL + QR
python deploy/deploy_daytona.py up              # later: push code / refreshed credentials, keeps the URL
python deploy/deploy_daytona.py up --recreate   # new server sandbox (new URL), e.g. after network changes
python deploy/deploy_daytona.py down            # delete this instance's sandboxes on Daytona

STANDUP_INSTANCE=alice python deploy/deploy_daytona.py up   # your own server (own URL); default instance: "shared"
```

Open the printed URL on a phone, or show `<url>/qr` on a laptop. The first browser visit shows Daytona's preview
warning page once.

## Run locally (no Daytona)

```bash
set -a; source .env; set +a
STANDUP_RUNNER=local PORT=8090 uvicorn webapp.server:app --port 8090
curl -F video=@office.mp4 localhost:8090/api/uploads     # then GET /api/uploads/<id>
```

## Gotchas

* **Network.** On Daytona Tiers 1–2, sandboxes only reach allowlisted hosts. Bedrock (`*.amazonaws.com`) and Arize
  are on the list. `*.surreal.cloud` had to be enabled for our org, and that only applies to sandboxes created
  afterwards.
* **Sandboxes can't drive other sandboxes.** The toolbox host is blocked from inside a sandbox, so the server
  can't run commands in a planner sandbox. That's why the planner pulls its job over the link network.
  Linked sandboxes need a snapshot, and the snapshot is taken from a builder sandbox, which needs only the sandbox
  permission.
* **Credentials.** Without the "manage secrets" permission on the Daytona key, the planner gets a 30-minute
  Bedrock token and the Arize key as environment variables. With it, use Daytona secrets limited to their hosts.
* **Known issue.** The folding-chair safety rule matches the old catalog's exercise IDs, not ExRx IDs, so it
  doesn't block bench dips on a folding chair yet.
