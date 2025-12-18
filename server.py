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

# Instrument bank definitions - each bank has 8 instruments (IDs 0-7)
INSTRUMENT_BANKS = {
    "electronic": {
        "name": "Electronic",
        "desc": "Modern synthesizers and electronic sounds",
        "instruments": {
            0: {"name": "saw_lead", "range": (48, 96), "desc": "cutting sawtooth lead synth"},
            1: {"name": "synth_bass", "range": (24, 60), "desc": "punchy electronic bass"},
            2: {"name": "synth_strings", "range": (48, 84), "desc": "lush synthetic string pad"},
            3: {"name": "square_lead", "range": (60, 96), "desc": "retro square wave melody"},
            4: {"name": "polysynth", "range": (48, 84), "desc": "warm polyphonic synth pad"},
            5: {"name": "dist_guitar", "range": (48, 84), "desc": "distorted power guitar"},
            6: {"name": "rock_organ", "range": (36, 84), "desc": "gritty rock organ"},
            7: {"name": "drums", "range": (36, 72), "desc": "electronic drum kit"},
        }
    },
    "acoustic": {
        "name": "Acoustic/Piano",
        "desc": "Natural acoustic instruments centered around piano",
        "instruments": {
            0: {"name": "grand_piano", "range": (21, 108), "desc": "concert grand piano"},
            1: {"name": "acoustic_bass", "range": (24, 60), "desc": "upright acoustic bass"},
            2: {"name": "strings", "range": (48, 84), "desc": "orchestral string ensemble"},
            3: {"name": "flute", "range": (60, 96), "desc": "concert flute melody"},
            4: {"name": "choir", "range": (48, 84), "desc": "vocal choir pad"},
            5: {"name": "acoustic_guitar", "range": (40, 84), "desc": "nylon string guitar"},
            6: {"name": "vibraphone", "range": (53, 89), "desc": "jazz vibraphone"},
            7: {"name": "drums", "range": (36, 72), "desc": "acoustic drum kit"},
        }
    },
    "orchestral": {
        "name": "Orchestral/Cinematic",
        "desc": "Epic orchestral instruments for cinematic compositions",
        "instruments": {
            0: {"name": "piano", "range": (21, 108), "desc": "grand piano"},
            1: {"name": "contrabass", "range": (24, 60), "desc": "orchestral contrabass"},
            2: {"name": "strings", "range": (36, 96), "desc": "full string orchestra"},
            3: {"name": "brass", "range": (36, 84), "desc": "brass section"},
            4: {"name": "choir", "range": (48, 84), "desc": "epic choir"},
            5: {"name": "harp", "range": (24, 103), "desc": "concert harp"},
            6: {"name": "woodwinds", "range": (48, 96), "desc": "woodwind ensemble"},
            7: {"name": "timpani", "range": (36, 72), "desc": "orchestral percussion"},
        }
    },
    "retro": {
        "name": "Retro/8-bit",
        "desc": "Chiptune and retro video game sounds",
        "instruments": {
            0: {"name": "pulse_lead", "range": (36, 96), "desc": "classic pulse wave lead"},
            1: {"name": "triangle_bass", "range": (24, 60), "desc": "triangle wave bass"},
            2: {"name": "noise_pad", "range": (48, 84), "desc": "filtered noise texture"},
            3: {"name": "square_lead", "range": (60, 96), "desc": "bright square melody"},
            4: {"name": "arp_synth", "range": (48, 84), "desc": "arpeggio synth"},
            5: {"name": "chip_pluck", "range": (48, 84), "desc": "short chip pluck"},
            6: {"name": "fm_bells", "range": (48, 96), "desc": "FM synthesis bells"},
            7: {"name": "drums", "range": (36, 72), "desc": "8-bit drum samples"},
        }
    },
}

# Default bank for backwards compatibility
DEFAULT_BANK = "electronic"

def get_bank_instruments(bank_id: str) -> dict:
    """Get instruments for a bank, defaulting to electronic."""
    bank = INSTRUMENT_BANKS.get(bank_id, INSTRUMENT_BANKS[DEFAULT_BANK])
    return bank["instruments"]

def build_instrument_list(bank_id: str) -> str:
    """Build instrument list description for a bank."""
    instruments = get_bank_instruments(bank_id)
    lines = []
    for i in range(8):
        inst = instruments[i]
        r = inst["range"]
        lines.append(f"- {i}: {inst['name']} (range {r[0]}-{r[1]}) - {inst['desc']}")
    return "\n".join(lines)

def build_instrument_summary(bank_id: str) -> str:
    """Build short instrument summary for refinement prompt."""
    instruments = get_bank_instruments(bank_id)
    parts = [f"{i}={instruments[i]['name']}" for i in range(8)]
    return ", ".join(parts)

def get_system_prompt(bank_id: str | None) -> str:
    """Generate system prompt with bank-specific instruments."""
    bank_info = INSTRUMENT_BANKS.get(bank_id) if bank_id else None

    if bank_id and bank_info:
        bank_section = f"""Instrument Bank: {bank_info['name']}
Style: {bank_info['desc']}
IMPORTANT: Only use instruments from this bank. Do not suggest switching banks.

"""
        instrument_list = build_instrument_list(bank_id)
    else:
        # Auto mode - LLM chooses bank
        bank_options = "\n".join([f"- {bid}: {b['name']} - {b['desc']}" for bid, b in INSTRUMENT_BANKS.items()])
        bank_section = f"""No instrument bank specified. Choose one that best fits the requested style.
Available banks:
{bank_options}

IMPORTANT: Your FIRST line of output MUST be: {{"bank": "<bank_id>"}}
Then output note events. Example first line: {{"bank": "electronic"}}

"""
        # Show electronic as example
        instrument_list = build_instrument_list(DEFAULT_BANK)

    return f"""You are a music composer generating MIDI sequences with multiple instruments.

{bank_section}Output format: JSON note events, one per line for streaming.
Each event: {{"t": <time_ms>, "n": <note_0-127>, "v": <velocity_1-127>, "d": <duration_ms>, "i": <instrument_id>}}

Available instruments:
{instrument_list}

Guidelines:
- Output ONLY valid JSON (bank selection if needed, then note events), one per line
- Choose 2-4 instruments that match the requested style/mood
- Keep each instrument within its optimal pitch range
- Bass (i=1): notes 24-48, foundation
- Melody (i=0,3): notes 60-84, prominence
- Pads/strings (i=2,4): notes 48-72, harmonic support
- Vary velocity for dynamics (soft: 40-60, medium: 70-90, loud: 100-127)
- Generate at least 200-500 notes for a complete piece

Example:
{{"t": 0, "n": 36, "v": 70, "d": 2000, "i": 1}}
{{"t": 0, "n": 60, "v": 65, "d": 1500, "i": 4}}
{{"t": 500, "n": 72, "v": 85, "d": 500, "i": 0}}"""

def get_refinement_prompt(bank_id: str, end_time: int) -> str:
    """Generate refinement prompt with bank-specific instruments."""
    bank_info = INSTRUMENT_BANKS.get(bank_id, INSTRUMENT_BANKS[DEFAULT_BANK])
    instrument_summary = build_instrument_summary(bank_id)

    return f"""You are ADDING to an existing MIDI sequence with multiple instruments.
The existing sequence ends at time {end_time}ms.
Instrument bank: {bank_info['name']} ({bank_info['desc']})

- Start your new notes AFTER the existing sequence (t > {end_time})
- Continue the musical style, key, and instrumentation
- Use the same instruments (i field) as the existing composition
- Output ONLY new note events as JSON, one per line
- Generate at least 30-50 new notes

Available instruments: {instrument_summary}"""

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


async def handle_compose(websocket: WebSocket, prompt: str, req_id: str, model: str, provider: str, cancel_event: asyncio.Event, max_tokens: int = 100000, session: dict = None, refine: bool = False, bank_id: str = None):
    """Handle a single compose request with streaming."""
    start_time = time.monotonic()
    first_chunk_time = None
    cancelled = False
    error_reason = None

    # Handle bank selection
    effective_bank = bank_id if bank_id and bank_id != "auto" and bank_id in INSTRUMENT_BANKS else None

    # If refining, use session's bank
    if refine and session and session.get("bank"):
        effective_bank = session["bank"]
    elif session is not None and effective_bank:
        session["bank"] = effective_bank

    # Build messages based on mode
    if refine and session and session.get("last_midi"):
        # Refinement mode: add to existing composition
        end_time = calculate_end_time(session["last_midi"])
        refine_bank = session.get("bank", DEFAULT_BANK)
        messages = [
            {"role": "system", "content": get_refinement_prompt(refine_bank, end_time)},
            {"role": "user", "content": f"The existing composition is: {session['original_prompt']}"},
            {"role": "user", "content": f"Add to the composition: {prompt}"},
        ]
        log.info(f"req={req_id[:8]} refine mode end_time={end_time} bank={refine_bank}")
    else:
        # New composition mode
        messages = [
            {"role": "system", "content": get_system_prompt(effective_bank)},
            {"role": "user", "content": f"Compose: {prompt}"},
        ]
        if session is not None:
            session["original_prompt"] = prompt
            session["last_midi"] = []
            if effective_bank:
                session["bank"] = effective_bank
        log.info(f"req={req_id[:8]} new composition bank={effective_bank or 'auto'}")

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

        # Parse accumulated content to extract MIDI notes and bank selection for session
        if session is not None and accumulated_content:
            import json
            new_notes = []
            detected_bank = None
            instruments = get_bank_instruments(session.get("bank", DEFAULT_BANK))

            for line in accumulated_content.split("\n"):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        obj = json.loads(line)
                        # Check for bank selection (LLM auto-pick)
                        if "bank" in obj and not detected_bank:
                            selected_bank = str(obj["bank"]).strip().lower()
                            if selected_bank in INSTRUMENT_BANKS:
                                detected_bank = selected_bank
                                session["bank"] = detected_bank
                                instruments = get_bank_instruments(detected_bank)
                                log.info(f"req={req_id[:8]} LLM selected bank={detected_bank}")
                        # Check for note event
                        elif all(k in obj for k in ["t", "n", "v", "d"]):
                            # Default instrument to 0 if missing
                            if "i" not in obj:
                                obj["i"] = 0
                            # Validate instrument ID (0-7)
                            if obj["i"] not in instruments:
                                obj["i"] = 0
                            new_notes.append(obj)
                    except json.JSONDecodeError:
                        pass

            if refine:
                session["last_midi"].extend(new_notes)
            else:
                session["last_midi"] = new_notes
            log.info(f"req={req_id[:8]} parsed {len(new_notes)} notes")

        # Include bank in done message for client to update UI
        done_msg = {"type": "done", "id": req_id}
        if session and session.get("bank"):
            done_msg["bank"] = session["bank"]
        await safe_send(done_msg)

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
        "bank": None,  # Will be set by client or LLM
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
                session["bank"] = None
                await websocket.send_json({"type": "session_cleared"})
                log.info("session cleared")

            elif msg_type == "compose":
                prompt = sanitize_prompt(data.get("prompt", ""))
                req_id = data.get("id", str(uuid.uuid4()))
                model = data.get("model", "google/gemini-3-flash-preview")
                provider = data.get("provider", "openrouter")
                max_tokens = data.get("maxTokens", 100000)
                refine = data.get("refine", False)
                bank_id = data.get("bankId")  # "auto", "electronic", "acoustic", etc.

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
                current_task = asyncio.create_task(handle_compose(websocket, prompt, req_id, model, provider, cancel_event, max_tokens, session, refine, bank_id))

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


@app.get("/api/banks")
async def list_banks():
    """Return available instrument banks."""
    banks = [{"id": "auto", "name": "Auto (LLM picks)", "desc": "Let the AI choose the best bank for your prompt"}]
    for bank_id, bank in INSTRUMENT_BANKS.items():
        banks.append({"id": bank_id, "name": bank["name"], "desc": bank["desc"]})
    return {"banks": banks, "default": DEFAULT_BANK}


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
