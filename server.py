"""FastAPI server with WebSocket streaming for AI music generation."""

import asyncio
import logging
import os
import re
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from llm import LLMClient

OLLAMA_BASE = "http://localhost:11434"
OPENROUTER_MODELS = [
    {"id": "google/gemini-3-pro-preview", "name": "Gemini 3 Pro"},
    {"id": "google/gemini-3-flash-preview", "name": "Gemini 3 Flash"},
    {"id": "xiaomi/mimo-v2-flash:free", "name": "Mimo V2 Flash"},
    {"id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2"},
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI()

SYSTEM_PROMPT = """You are a music composer generating MIDI sequences.

Output format: JSON array of note events, one per line for streaming.
Each event: {"t": <time_ms>, "n": <note_0-127>, "v": <velocity_1-127>, "d": <duration_ms>}

Guidelines:
- Output ONLY valid JSON note events, one per line
- Start notes at t=0 or shortly after
- Use musical scales and chord progressions
- Vary velocity for dynamics (soft: 40-60, medium: 70-90, loud: 100-127)
- Keep melodies within reasonable range (48-84 for most instruments)
- Create coherent musical phrases, not random notes
- Generate at least 50-100 notes for a complete musical piece
- Include bass notes (36-48), chords (48-72), and melody (60-84)

Example output:
{"t": 0, "n": 60, "v": 80, "d": 500}
{"t": 0, "n": 64, "v": 75, "d": 500}
{"t": 0, "n": 67, "v": 70, "d": 500}
{"t": 500, "n": 62, "v": 85, "d": 500}
{"t": 500, "n": 65, "v": 80, "d": 500}
{"t": 1000, "n": 64, "v": 90, "d": 1000}"""

REFINEMENT_PROMPT = """You are ADDING to an existing MIDI sequence.
The existing sequence ends at time {end_time}ms.
- Start your new notes AFTER the existing sequence (t > {end_time})
- Continue the musical style and key
- Output ONLY new note events as JSON, one per line
- Do NOT repeat any existing notes
- Generate at least 30-50 new notes"""

# Timeouts (seconds) - generous for local LLMs
START_CHUNK_DEADLINE = 60.0
IDLE_CHUNK_GAP = 60.0
REQUEST_HARD_LIMIT = 300.0
MAX_PROMPT_LEN = 512


def sanitize_prompt(prompt: str) -> str:
    """Trim and remove control characters."""
    prompt = prompt.strip()
    prompt = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", prompt)
    return prompt


def calculate_end_time(midi_notes: list) -> int:
    """Calculate the end time of the last note in milliseconds."""
    if not midi_notes:
        return 0
    max_end = 0
    for note in midi_notes:
        end = note.get("t", 0) + note.get("d", 0)
        if end > max_end:
            max_end = end
    return max_end


async def handle_compose(websocket: WebSocket, prompt: str, req_id: str, model: str, provider: str, cancel_event: asyncio.Event, max_tokens: int = 100000, session: dict = None, refine: bool = False):
    """Handle a single compose request with streaming."""
    start_time = time.monotonic()
    first_chunk_time = None
    cancelled = False
    error_reason = None

    # Build messages based on mode
    if refine and session and session.get("last_midi"):
        # Refinement mode: add to existing composition
        end_time = calculate_end_time(session["last_midi"])
        messages = [
            {"role": "system", "content": REFINEMENT_PROMPT.format(end_time=end_time)},
            {"role": "user", "content": f"The existing composition is: {session['original_prompt']}"},
            {"role": "user", "content": f"Add to the composition: {prompt}"},
        ]
        log.info(f"req={req_id[:8]} refine mode end_time={end_time}")
    else:
        # New composition mode
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Compose: {prompt}"},
        ]
        if session is not None:
            session["original_prompt"] = prompt
            session["last_midi"] = []
        log.info(f"req={req_id[:8]} new composition")

    llm_client = LLMClient(model=model, provider=provider, max_tokens=max_tokens)
    await websocket.send_json({"type": "start", "id": req_id})

    async def safe_send(msg):
        try:
            await websocket.send_json(msg)
        except Exception:
            pass  # Client disconnected

    accumulated_content = ""
    try:
        chunks_sent = 0
        async for chunk_type, chunk_data in llm_client.stream_completion(messages):
            if cancel_event.is_set():
                cancelled = True
                await safe_send({"type": "cancelled", "id": req_id})
                log.info(f"req={req_id[:8]} cancelled after {chunks_sent} chunks")
                return

            if first_chunk_time is None:
                first_chunk_time = time.monotonic() - start_time

            # Accumulate content for session history
            if chunk_type == "content":
                accumulated_content += chunk_data

            try:
                msg_type = "thinking" if chunk_type == "thinking" else "chunk"
                await websocket.send_json({"type": msg_type, "id": req_id, "data": chunk_data})
                chunks_sent += 1
            except Exception:
                log.info(f"req={req_id[:8]} client disconnected after {chunks_sent} chunks")
                return

        log.info(f"req={req_id[:8]} stream done, sent {chunks_sent} chunks")

        # Parse accumulated content to extract MIDI notes for session
        if session is not None and accumulated_content:
            import json
            new_notes = []
            for line in accumulated_content.split("\n"):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        note = json.loads(line)
                        if all(k in note for k in ["t", "n", "v", "d"]):
                            new_notes.append(note)
                    except json.JSONDecodeError:
                        pass

            if refine:
                session["last_midi"].extend(new_notes)
            else:
                session["last_midi"] = new_notes
            log.info(f"req={req_id[:8]} parsed {len(new_notes)} notes")

        await safe_send({"type": "done", "id": req_id})

    except ConnectionError as e:
        error_reason = "llm_unavailable"
        await safe_send({"type": "error", "id": req_id, "message": "Cannot connect to LLM. Is the service running?"})
    except Exception as e:
        error_reason = str(e)
        await safe_send({"type": "error", "id": req_id, "message": "An error occurred."})
        log.exception(f"req={req_id[:8]} error")
    finally:
        total_duration = time.monotonic() - start_time
        log.info(f"req={req_id[:8]} first_chunk_ms={int(first_chunk_time*1000) if first_chunk_time else None} total_ms={int(total_duration*1000)} cancelled={cancelled} error={error_reason}")


@app.websocket("/ws/compose")
async def websocket_compose(websocket: WebSocket):
    """WebSocket endpoint for composition."""
    await websocket.accept()
    log.info("ws connect")

    current_task: asyncio.Task | None = None
    cancel_event = asyncio.Event()

    # Session state for iterative refinement
    session = {
        "original_prompt": None,
        "last_midi": [],
        "tempo": 120,
    }

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "cancel":
                if current_task and not current_task.done():
                    cancel_event.set()
                    await current_task
                    cancel_event.clear()

            elif msg_type == "clear_session":
                # Reset session state for new conversation
                session["original_prompt"] = None
                session["last_midi"] = []
                session["tempo"] = 120
                await websocket.send_json({"type": "session_cleared"})
                log.info("session cleared")

            elif msg_type == "compose":
                prompt = sanitize_prompt(data.get("prompt", ""))
                req_id = data.get("id", str(uuid.uuid4()))
                model = data.get("model", "google/gemini-3-flash-preview")
                provider = data.get("provider", "openrouter")
                max_tokens = data.get("maxTokens", 100000)
                refine = data.get("refine", False)

                if not prompt:
                    await websocket.send_json({"type": "error", "id": req_id, "message": "Prompt cannot be empty."})
                    continue

                if len(prompt) > MAX_PROMPT_LEN:
                    await websocket.send_json({"type": "error", "id": req_id, "message": f"Prompt too long (max {MAX_PROMPT_LEN} chars)."})
                    continue

                # Cancel existing task
                if current_task and not current_task.done():
                    cancel_event.set()
                    await current_task
                    cancel_event.clear()

                # Start new task
                current_task = asyncio.create_task(handle_compose(websocket, prompt, req_id, model, provider, cancel_event, max_tokens, session, refine))

    except WebSocketDisconnect:
        log.info("ws disconnect")
    except Exception as e:
        log.exception("ws error")
    finally:
        if current_task and not current_task.done():
            cancel_event.set()
            current_task.cancel()
            try:
                await current_task
            except asyncio.CancelledError:
                pass


@app.get("/api/models")
async def list_models():
    """Fetch available models from Ollama and OpenRouter."""
    models = []

    # Fetch Ollama models
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags", timeout=5.0)
            resp.raise_for_status()
            data = resp.json()
            for m in data.get("models", []):
                models.append({"name": m["name"], "provider": "ollama"})
    except Exception as e:
        log.warning(f"Failed to fetch Ollama models: {e}")

    # Add OpenRouter models if API key exists
    if os.environ.get("OPENROUTER_API_KEY"):
        for m in OPENROUTER_MODELS:
            entry = {"name": m["id"], "displayName": m["name"], "provider": "openrouter"}
            if "maxTokens" in m:
                entry["maxTokens"] = m["maxTokens"]
            models.append(entry)

    return {"models": models}


# Static files
static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/")
async def root():
    """Serve index.html."""
    return FileResponse(static_path / "index.html")
