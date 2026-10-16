# Sponsor integrations (hackathon)

| Sponsor | Status | What it does in the app | Demo talking point |
|---|---|---|---|
| **Daytona** | ✅ live | Hosts the web app (public preview URL) and gives every upload its own ephemeral, linked planner sandbox, created from a snapshot, deleted afterwards, with a TTL cap | "Your office footage is processed in a computer that exists for about 2 minutes and is then destroyed." |
| **SurrealDB** | ✅ live (Cloud) | The scraped ExRx graph (1,865 exercises) is the exercise library. Candidates come from a graph plus full-text query, and every upload is stored as a graph next to it | "Your office becomes a graph: upload → objects → what they afford ← exercises that need it." |
| **Arize AX** | ✅ wired, optional | One trace per upload across the server and the planner sandbox. Every Claude call, plus each safety-rule override as a GUARDRAIL span | "We don't trust the model blindly: here's how often our code had to override an unsafe suggestion." |
| **Anchor Browser** | ⬜ not started | Idea: browse ExRx (which blocks plain scrapers) to verify and refresh exercise data and fetch form cues | Fits the scraping pipeline that built the ExRx database |

## Daytona
* Code: `webapp/server.py` (`start_daytona`), `deploy/deploy_daytona.py`, `deploy/planner_*.py`,
  `standup_agent/worker.py`. The one-off CLI version is `standup_agent/daytona_runner.py`.
* Constraints we hit and how we worked around them: see `docs/ARCHITECTURE.md` → "Why it's built this way".
* Next steps: a key with *manage secrets* (so credentials are hidden from the sandbox), and possibly a warm pool for
  instant planner start (needs support to enable it).

## SurrealDB
* Code: `webapp/db.py`. Login: `config/surreal.env` (shared test root user).
* The ExRx tables are never modified. The app's own tables are listed in `docs/ARCHITECTURE.md`.
* Ideas: use the existing 384-d `embedding` HNSW index for semantic candidate search. This needs the same embedding
  model the scraper used; check which one before relying on it. Also live queries (`LIVE SELECT`) for a shared
  office map.

## Arize AX
* Code: `standup_agent/tracing.py`, with spans throughout `reasoner.py`, `run.py` and `server.py`.
* Turn it on with `ARIZE_SPACE_ID` + `ARIZE_API_KEY` (project `just-standup`). It's off when they're unset.
* Next steps (the evals idea): an LLM judge on each plan or video, logged as EVALUATOR spans, and comparing models
  (Opus vs Sonnet vs Haiku through `STANDUP_VLM=bedrock:<model id>`) as Arize experiments on guardrail-override rate,
  latency and cost.

## Claude on Amazon Bedrock (the model)
* `standup_agent/reasoner.py` → `BedrockVLM`: `AnthropicBedrock` client, `global.anthropic.claude-opus-5-5`,
  effort `medium` (`STANDUP_VLM_EFFORT`), with a client-side refusal fallback to `global.anthropic.claude-opus-4-8`.
* Auth: the server mints a 30-minute Bedrock bearer token from its AWS credentials for each planner sandbox.
