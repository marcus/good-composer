# Good Composer

Real-time AI music generation app that streams MIDI from LLMs via WebSocket, with progressive playback, visualization, and history.

## Quick Start

```bash
# Install dependencies
uv sync

# Set OpenRouter API key (or use local Ollama)
export OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Run the server
uvicorn server:app --reload --port 8000
```

Open http://localhost:8000

## Architecture

```
Browser (vanilla JS + Tone.js) <-WebSocket-> FastAPI <-LiteLLM-> Ollama/OpenRouter
```

## Key Files

- `server.py` - FastAPI backend, WebSocket `/ws/compose`, model list endpoint
- `llm.py` - LiteLLM streaming client (supports Ollama + OpenRouter)
- `static/app.js` - Main orchestrator, state machine, WebSocket client
- `static/midi-parser.js` - Streaming JSON parser for MIDI events
- `static/audio-player.js` - Tone.js progressive playback with auto-play
- `static/piano-roll.js` - Canvas horizontal piano roll visualization

## MIDI Format

Each note event is a JSON object:
```json
{"t": 0, "n": 60, "v": 80, "d": 500}
```
- `t`: time in milliseconds (start time)
- `n`: MIDI note number (0-127, 60 = middle C)
- `v`: velocity (1-127)
- `d`: duration in milliseconds

## WebSocket Protocol

**Client -> Server:**
- `compose`: Generate music from prompt
- `cancel`: Stop current generation
- `clear_session`: Reset session state
- `ping`: Keep connection alive

**Server -> Client:**
- `start`: Generation started
- `thinking`: Model thinking (for thinking models)
- `chunk`: MIDI JSON fragment
- `done`: Generation complete
- `cancelled`: Request cancelled
- `error`: Error occurred
- `pong`: Ping response

## Features

- Progressive playback as notes stream in
- Auto-play toggle (default: on)
- Horizontal piano roll visualization
- Iterative refinement (add to existing composition)
- Session gallery with thumbnails
- Tempo control (60-180 BPM)
- Multi-model support (Ollama local, OpenRouter cloud)

## Providers

- **Ollama**: Local LLM (no API key needed)
- **OpenRouter**: Cloud access to GPT-4, Claude, Gemini, etc.
