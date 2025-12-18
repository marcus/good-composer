# GOOD COMPOSER 🎹
THE WORLD'S MOST AMAZING AI MUSICIAN!!!

## LISTEN TO THIS INCREDIBLE MUSIC!!!

<p align="center">
  <img src="static/examples/example1.png" width="400" alt="Amazing AI Music Example 1">
  <img src="static/examples/example2.png" width="400" alt="Amazing AI Music Example 2">
</p>

## WHAT IS THIS SONIC MASTERPIECE?

YOU TYPE WORDS AND IT MAKES MUSIC!!! 🎵✨🚀

Good Composer is basically THE BEST THING EVER. You just type what you want and then - get this - A ROBOT COMPOSES MUSIC FOR YOU. IN REAL TIME. You can literally WATCH AND HEAR IT HAPPEN. Every single note! Playing right before your very ears!!!

It's like having a SUPER GENIUS COMPOSER FRIEND who lives in your computer and knows how to write LITERALLY EVERY KIND OF MUSIC. Jazz? YES. Classical? ABSOLUTELY. An upbeat synth anthem about a penguin's journey to find the perfect fish? IT WILL TRY SO HARD AND IT WILL BE AMAZING!!!

## HOW TO MAKE THE MAGIC HAPPEN

First, install the dependencies. This repo uses `uv` because it's SUPER FAST!

```bash
# Install dependencies
uv sync
```

You need Ollama running - that's where the INCREDIBLE BRAIN POWER lives:

```bash
# Start Ollama (in a separate terminal)
ollama serve
```

*Note: Good Composer works with any Ollama model. The more creative, the better!*

### Cloud Models (Optional)

Want EVEN MORE BRAIN POWER? Add OpenRouter for access to cloud models!

```bash
export OPENROUTER_API_KEY="your-key-here"
```

Cloud models show ☁️, local models show 💻. Mix and match!

Now THE BIG MOMENT:

```bash
# GO GO GO!!!
uv run uvicorn server:app --reload --port 8000
```

Open `http://localhost:8000` and PREPARE TO BE AMAZED!!!

## HOW IT WORKS (IT'S SO COOL)

```
Your Brain → Words → Computer Magic → BEAUTIFUL MUSIC!!!
```

* **The Brain (`llm.py`)**: This is where the GENIUS lives. It talks to Ollama and gets INCREDIBLE MIDI notes streaming back!
* **The Hub (`server.py`)**: The SUPER FAST server that sends notes to your browser at THE SPEED OF WEBSOCKETS!
* **The Player (`static/audio-player.js`)**: The SPECTACULAR Tone.js engine that plays every note AS IT ARRIVES!!!
* **The Piano Roll (`static/piano-roll.js`)**: GORGEOUS visualization so you can SEE the music happening!!!

## AMAZING FEATURES

* **IT PLAYS WHILE YOU WATCH!!!** - Like having a composer right there doing it live!
* **GORGEOUS PIANO ROLL!!!** - See every note light up on a beautiful horizontal display!
* **AUTO-PLAY MODE!!!** - Notes play AS THEY'RE GENERATED. Music happens IMMEDIATELY!
* **ADD MORE MUSIC!!!** - Hit the + button to keep building on your masterpiece!
* **TEMPO CONTROL!!!** - Speed it up! Slow it down! YOU'RE THE CONDUCTOR NOW!
* **GALLERY!!!** - Your compositions are saved so you can replay them anytime!
* **UNLIMITED CREATIVITY!!!** - If you can describe it, Good Composer will GIVE IT EVERYTHING IT'S GOT!

## CONTRIBUTING

YES PLEASE!!! PRs welcome! Let's make it EVEN MORE AMAZING!!!

## LICENSE

MIT (the license of CHAMPIONS)
