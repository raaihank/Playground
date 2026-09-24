"""Jev vs OpenAI — prompt-attack detection benchmark rendered as contribution graphs.

Run: uv run uvicorn app:app --reload
"""

import asyncio
import json
import os
import time
from pathlib import Path

import httpx
import openai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

load_dotenv()

from classifiers import build_models  # noqa: E402  (needs env loaded first)

ROOT = Path(__file__).parent
RESULTS_DIR = Path(os.getenv("RESULTS_DIR", ROOT / "results"))
RESULTS_DIR.mkdir(exist_ok=True)
CONCURRENCY = int(os.getenv("CONCURRENCY", "4"))
MAX_ATTEMPTS = 4

ROWS = [json.loads(line) for line in (ROOT / "data.jsonl").read_text().splitlines() if line.strip()]
MODELS = build_models()
_clients: dict[str, object] = {}
_locks: dict[str, asyncio.Lock] = {k: asyncio.Lock() for k in MODELS}

app = FastAPI()


def cache_path(key: str) -> Path:
    return RESULTS_DIR / f"{key}.json"


def load_cache(key: str) -> dict[str, dict]:
    p = cache_path(key)
    return json.loads(p.read_text()) if p.exists() else {}


def save_cache(key: str, cache: dict[str, dict]) -> None:
    cache_path(key).write_text(json.dumps(cache, indent=1))


def is_retryable(e: Exception) -> bool:
    if isinstance(e, httpx.HTTPStatusError):
        return e.response.status_code in (429, 500, 502, 503, 504)
    if isinstance(e, (httpx.TransportError, openai.APIConnectionError, openai.RateLimitError)):
        return True
    return isinstance(e, openai.InternalServerError)


async def run_one(key: str, idx: int, row: dict, sem: asyncio.Semaphore) -> dict:
    client = _clients[key]
    async with sem:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            # Latency covers only the attempt that produced the answer, so rate-limit
            # backoff doesn't pollute the timing comparison.
            start = time.perf_counter()
            try:
                out = await client.classify(row["normalized_text"])
                latency_ms = (time.perf_counter() - start) * 1000
                return {"id": row["id"], "idx": idx, "latency_ms": round(latency_ms, 1),
                        "attempts": attempt, **out}
            except Exception as e:  # noqa: BLE001 — surfaced per-cell in the UI
                if attempt < MAX_ATTEMPTS and is_retryable(e):
                    await asyncio.sleep(2 ** attempt)
                    continue
                return {"id": row["id"], "idx": idx, "error": f"{type(e).__name__}: {e}"[:500],
                        "attempts": attempt}


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/state")
def state():
    return {
        "rows": [{"id": r["id"], "text": r["normalized_text"], "label": int(r["label"])} for r in ROWS],
        "models": {k: {"label": m["label"], "model": m["model"]} for k, m in MODELS.items()},
        "results": {k: load_cache(k) for k in MODELS},
        "concurrency": CONCURRENCY,
    }


@app.get("/api/run/{key}")
async def run(key: str, force: bool = False, retry_errors: bool = True):
    if key not in MODELS:
        raise HTTPException(404, f"unknown model {key}")
    lock = _locks[key]
    if lock.locked():
        raise HTTPException(409, f"{key} is already running")

    async def stream():
        async with lock:
            try:
                if key not in _clients:
                    _clients[key] = MODELS[key]["factory"]()
            except KeyError as e:
                yield sse("fatal", {"error": f"missing env var {e}"})
                return

            cache = {} if force else load_cache(key)
            todo = [
                (i, r) for i, r in enumerate(ROWS)
                if r["id"] not in cache or (retry_errors and "error" in cache[r["id"]])
            ]
            if force:
                save_cache(key, cache)
            yield sse("start", {"total": len(ROWS), "todo": len(todo), "reset": force})

            sem = asyncio.Semaphore(CONCURRENCY)
            tasks = [asyncio.create_task(run_one(key, i, r, sem)) for i, r in todo]
            try:
                for fut in asyncio.as_completed(tasks):
                    res = await fut
                    cache[res["id"]] = res
                    save_cache(key, cache)
                    yield sse("result", res)
                yield sse("done", {})
            finally:
                for t in tasks:
                    t.cancel()

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
