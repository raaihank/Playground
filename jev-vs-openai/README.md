# Jev vs OpenAI — prompt-attack detection

A small web app that runs every sample in `data.jsonl` through three models:

- **Jev** (TypeSafe `systemone`, Noul question)
- **OpenAI Luna**
- **OpenAI Terra**

It calls each model's real API and times each call. It shows one GitHub-style contribution graph per model, with one square per sample.

`label` 1 means the sample is an attack and 0 means benign. The text sent to each model is `normalized_text`.

## Setup

```bash
cp .env.example .env   # add TYPESAFE_API_KEY and OPENAI_API_KEY
uv sync
uv run uvicorn app:app --reload
```

Open http://127.0.0.1:8000 and click **Run all**, or run a single model from its card.

## How it works

- Results stream into the page over SSE as they finish. They're also cached in `results/<model>.json`.
- **Run** calls only the samples that have no result yet or that errored. **Rerun** deletes that model's cache and calls every sample again.
- Latency is timed around the API call for the attempt that returned the answer. When a request hits a 429 or 5xx error, the app waits and retries, and that wait doesn't count toward latency.
- `CONCURRENCY` sets how many requests run in parallel per model. Set it to 1 to get the least queue-affected latency numbers.
- Color modes:
  - **Outcome**: caught attack / correct benign / false alarm / missed attack
  - **Latency**: quartiles shared across all three models
  - **Attack score**
- Click a square to see all three verdicts and the full text of that sample.
