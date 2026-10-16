# Onboarding: Just Standup

Welcome! In ~15 minutes you'll have the app running against the live services and know where everything is.

**The product:** someone films their workspace on a phone and gets 3 safe exercises that use what's around them
(chair, desk edge, railing, step, open floor). Each one comes with a photo of the spot, the reason it fits, a
safety tip, and the ExRx instructions and video link.

**The stack:** Daytona sandboxes (hosting + one throwaway sandbox per upload) · Claude Opus 5.5 on Amazon Bedrock
(reasoning) · SurrealDB Cloud (ExRx exercise graph + results) · Arize AX (tracing, optional).
Read `README.md` for the overview, `docs/ARCHITECTURE.md` for how it works, `docs/SPONSORS.md` for how each sponsor
is used.

## 1. Get access (ask the project owner)

| What | How | Why |
|---|---|---|
| GitHub | collaborator on `briannlongzhao/just-stand-up` (private) | the code |
| **Daytona** | an **invite to the project's Daytona organization**, then create your own API key there (Dashboard → Keys) | ⚠️ Must be *our* org: SurrealDB Cloud is only reachable from sandboxes in it |
| AWS (Bedrock) | your own temporary credentials from the hackathon AWS portal (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, region `us-west-2`) | Claude via Bedrock; they expire every few hours |
| SurrealDB | nothing to do: `config/surreal.env` is committed (shared **test** root login) | the ExRx graph in `exrx/exrx` |
| Arize (optional) | Space ID + API key from the owner | traces |

## 2. Set up

```bash
git clone git@github.com:briannlongzhao/just-stand-up.git && cd just-stand-up
python3 -m venv .venv && source .venv/bin/activate      # Python 3.11+
pip install -r requirements.txt
cp .env.example .env                                     # fill in Daytona, AWS (and Arize)
set -a; source .env; source config/surreal.env; set +a   # do this in every new shell
```

Check SurrealDB access (should print 1865):

```bash
python -c "from webapp import db
with db.connect() as c: print(c.query('SELECT VALUE count() FROM exercise GROUP ALL;')[0])"
```

## 3. Try the live app

The current deployment (on Daytona; the URL changes if the server is recreated):
**https://8080-697ad785-13c4-481f-b05e-782bc2794d14.daytonaproxy01.net** (QR: append `/qr`)

Test server with the sample scenes (instance `test`):
**https://8080-3ade338c-9762-4f2d-8fea-ddfb285747c9.daytonaproxy01.net**, QR code: [`docs/test-server-qr.png`](docs/test-server-qr.png). It goes stale if that instance is recreated or taken down.

```bash
scripts/smoke_test.sh https://8080-697ad785-13c4-481f-b05e-782bc2794d14.daytonaproxy01.net
```

That uploads `samples/office.mp4` and prints the 3 recommendations, in about 1.5–2 minutes.

## 4. Run it locally (fastest loop for code changes)

Needs `ffmpeg` installed. It still uses the real Bedrock and SurrealDB Cloud, but the planner runs as a local
process instead of a Daytona sandbox:

```bash
STANDUP_RUNNER=local PORT=8090 uvicorn webapp.server:app --port 8090
scripts/smoke_test.sh http://localhost:8090          # or open http://localhost:8090 in a browser
```

Just the planner on one video (writes `out/plan.md`):

```bash
python -m standup_agent.run --video samples/office.mp4 --out out --vlm bedrock --plan_only
```

## 5. Deploying (coordinate first!)

**Your own server (do this for testing):** set `STANDUP_INSTANCE` to your name. You get a separate server sandbox with
its own URL and QR, and `up` / `down` only touch your sandboxes:

```bash
STANDUP_INSTANCE=<your-name> python deploy/deploy_daytona.py up     # create/update your server, prints URL + QR
STANDUP_INSTANCE=<your-name> python deploy/deploy_daytona.py down   # delete only your sandboxes
```

(Or put `STANDUP_INSTANCE=<your-name>` in your `.env`.) Every instance uses the same SurrealDB Cloud database and
Bedrock account, and the planner snapshot is shared.

**The team's demo server** is the `shared` instance (no `STANDUP_INSTANCE` set):

```bash
python deploy/deploy_daytona.py up      # push your local code + credentials to THE shared server (same URL)
```

⚠️ `up` without `STANDUP_INSTANCE` overwrites the shared demo server with *your* working copy, so say in chat
before you deploy, and deploy from an up-to-date `main`. `up --recreate` makes a new server (**new URL, the old QR
stops working**). `down` deletes that instance's sandboxes on Daytona.

AWS credentials expired? Put fresh ones in `.env`, `source` it, and run `up` again. Nothing is recreated.

## 6. Where to change things

| You want to… | Edit |
|---|---|
| change the phone UI | `webapp/index.html` (approved design: `docs/reference/01_UI.html`, open it in a browser) |
| change which exercises can be suggested | `webapp/db.py`: `SEARCH` phrases per spot type, `EXCLUDE`, `BODYWEIGHT` |
| change what Claude is asked / the safety rules | `standup_agent/reasoner.py`: `SCENE_Q`, `PLAN_Q`, `OBJECT_RULES` |
| change the model or effort | env `STANDUP_VLM=bedrock:global.anthropic.claude-sonnet-5-5`, `STANDUP_VLM_EFFORT=low` |
| add playable demo videos | `python -m webapp.demo_videos export` → fill `webapp/demo_videos.csv` → `… load` |
| look at the data | Surrealist with `config/surreal.env`; queries in `docs/ARCHITECTURE.md` |

## 7. Known issues / good first tasks

* **Safety gap:** the folding-chair rule matches the old catalog's exercise IDs, not ExRx IDs, so it can allow bench
  dips on a folding chair. Fix: match by exercise name or kind in `reasoner.py`.
* Some candidates are odd fits (for example sit-ups listed under "seat"). Tune `SEARCH` / `EXCLUDE` in `webapp/db.py`.
* No wall exercises survive the "must have a video" filter. Add YouTube demos through `demo_videos`, or relax the
  filter for stretches.
* Planning takes about 70–120 s (about 10 sequential Claude calls). Try parallel calls or a faster model for some
  steps.
* Not done yet: the Anchor Browser integration and Arize evals (see `docs/SPONSORS.md`).

## Rules

* Never commit `.env` or any key other than the shared test `config/surreal.env`.
* The ExRx tables in SurrealDB are **read-only** for the app. Only the app's own tables are written.
* Rotate all credentials after the hackathon.
