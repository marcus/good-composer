// Progressive MIDI playback using smplr for high-quality instruments

// Instrument configurations mapping instrument IDs to smplr instruments (rock/techno)
const INSTRUMENT_CONFIGS = {
    0: { type: 'soundfont', instrument: 'lead_2_sawtooth', name: 'Saw Lead', volume: 0.75 },
    1: { type: 'soundfont', instrument: 'synth_bass_1', name: 'Synth Bass', volume: 0.9 },
    2: { type: 'soundfont', instrument: 'synth_strings_1', name: 'Synth Strings', volume: 0.7 },
    3: { type: 'soundfont', instrument: 'lead_1_square', name: 'Square Lead', volume: 0.7 },
    4: { type: 'soundfont', instrument: 'pad_3_polysynth', name: 'Polysynth Pad', volume: 0.6 },
    5: { type: 'soundfont', instrument: 'distortion_guitar', name: 'Distortion Guitar', volume: 0.8 },
    6: { type: 'soundfont', instrument: 'rock_organ', name: 'Rock Organ', volume: 0.7 },
    7: { type: 'drums', name: 'Drums', volume: 0.85 }
};

// Map MIDI drum notes to smplr DrumMachine sample names
const DRUM_NOTE_MAP = {
    35: 'kick', 36: 'kick',
    38: 'snare', 40: 'snare',
    37: 'snare',  // side stick -> snare
    39: 'clap',
    42: 'hh', 44: 'hh', 46: 'hh-open',
    41: 'tom-1', 43: 'tom-1', 45: 'tom-2', 47: 'tom-2', 48: 'tom-3', 50: 'tom-3',
    49: 'crash', 57: 'crash',
    51: 'ride', 59: 'ride', 53: 'ride',
    56: 'cowbell',
};

class AudioPlayer {
    constructor() {
        this.context = null;
        this.instruments = {};
        this.scheduledNotes = new Set();
        this.notes = [];
        this.isPlaying = false;
        this.autoPlay = true;
        this.isLooping = false;
        this.startOffset = 0;
        this.onNoteStart = null;
        this.onNoteEnd = null;
        this.onTimeUpdate = null;
        this.onPlayStateChange = null;
        this.animationId = null;
        this.initialized = false;
        this.smplrModule = null;

        // Playback state
        this.playbackStartTime = 0;
        this.playbackPosition = 0;
        this.scheduledEvents = [];
        this.tempo = 120;
    }

    async init() {
        if (this.initialized) return;

        // Dynamic import of smplr
        if (!this.smplrModule) {
            this.smplrModule = await import("https://unpkg.com/smplr/dist/index.mjs");
        }

        const { SplendidGrandPiano, Soundfont, DrumMachine } = this.smplrModule;

        // Create AudioContext
        this.context = new AudioContext();

        // Create all instruments
        const loadPromises = [];

        for (const [id, config] of Object.entries(INSTRUMENT_CONFIGS)) {
            let instrument;

            if (config.type === 'piano') {
                instrument = new SplendidGrandPiano(this.context, {
                    decayTime: 0.8,
                    volume: this.normalizeVolume(config.volume)
                });
            } else if (config.type === 'drums') {
                instrument = new DrumMachine(this.context, {
                    volume: this.normalizeVolume(config.volume)
                });
            } else {
                instrument = new Soundfont(this.context, {
                    instrument: config.instrument,
                    volume: this.normalizeVolume(config.volume)
                });
            }

            this.instruments[id] = instrument;
            loadPromises.push(instrument.load);
        }

        // Wait for all instruments to load
        await Promise.all(loadPromises);
        this.initialized = true;
        console.log('smplr instruments loaded');
    }

    normalizeVolume(vol) {
        // smplr volume is 0-127
        return Math.round(vol * 100);
    }

    getInstrument(instrumentId) {
        const id = (instrumentId in this.instruments) ? instrumentId : 0;
        return this.instruments[id];
    }

    scheduleNote(note) {
        const instrumentId = note.i ?? 0;
        const noteId = `${note.t}-${note.n}-${note.d}-${instrumentId}`;
        if (this.scheduledNotes.has(noteId)) return;
        this.scheduledNotes.add(noteId);
        this.notes.push(note);

        // If currently playing, schedule this note
        if (this.isPlaying) {
            this._scheduleNotePlayback(note);
        }

        // Auto-start playback on first note if autoPlay enabled
        if (this.autoPlay && !this.isPlaying && this.scheduledNotes.size === 1) {
            this.play();
        }
    }

    _scheduleNotePlayback(note) {
        const instrumentId = note.i ?? 0;
        const instrument = this.getInstrument(instrumentId);
        if (!instrument) return;

        const noteTimeMs = note.t;
        const durationSec = Math.max(note.d / 1000, 0.05);
        const velocity = note.v;

        // Calculate when this note should play relative to current playback
        const currentTimeMs = this.getCurrentTime();
        const delayMs = noteTimeMs - currentTimeMs;

        if (delayMs < -note.d) {
            // Note already fully passed
            return;
        }

        const scheduleTime = Math.max(0, delayMs);
        const contextTime = this.context.currentTime + (scheduleTime / 1000);

        // Handle drums: map MIDI note to sample name
        if (instrumentId === 7) {
            const drumName = DRUM_NOTE_MAP[note.n] || 'kick';
            instrument.start({
                note: drumName,
                velocity: velocity,
                time: contextTime
            });
        } else {
            // Clamp note to valid piano range (A0=21 to C8=108)
            const clampedNote = Math.max(21, Math.min(108, note.n));
            instrument.start({
                note: clampedNote,
                velocity: velocity,
                duration: durationSec,
                time: contextTime
            });
        }

        // Schedule visual callbacks
        if (scheduleTime > 0) {
            const startTimeout = setTimeout(() => {
                if (this.onNoteStart) this.onNoteStart(note);
            }, scheduleTime);
            this.scheduledEvents.push(startTimeout);

            const endTimeout = setTimeout(() => {
                if (this.onNoteEnd) this.onNoteEnd(note);
            }, scheduleTime + note.d);
            this.scheduledEvents.push(endTimeout);
        } else {
            // Note should start now
            if (this.onNoteStart) this.onNoteStart(note);
            const endTimeout = setTimeout(() => {
                if (this.onNoteEnd) this.onNoteEnd(note);
            }, Math.max(0, noteTimeMs + note.d - currentTimeMs));
            this.scheduledEvents.push(endTimeout);
        }
    }

    async play() {
        await this.init();

        if (this.context.state === 'suspended') {
            await this.context.resume();
        }

        this.isPlaying = true;
        this.playbackStartTime = this.context.currentTime - (this.playbackPosition / 1000);

        // Schedule all notes from current position
        for (const note of this.notes) {
            this._scheduleNotePlayback(note);
        }

        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }
        this.startTimeAnimation();
    }

    pause() {
        this.isPlaying = false;
        this.playbackPosition = this.getCurrentTime();
        this._clearScheduledEvents();
        this._stopAllInstruments();
        this.stopTimeAnimation();

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.playbackPosition, this.getTotalDuration());
        }
        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }
    }

    stop() {
        this.isPlaying = false;
        this.playbackPosition = 0;
        this._clearScheduledEvents();
        this._stopAllInstruments();
        this.stopTimeAnimation();

        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }
        if (this.onTimeUpdate) {
            this.onTimeUpdate(0, this.getTotalDuration());
        }
    }

    _clearScheduledEvents() {
        for (const timeoutId of this.scheduledEvents) {
            clearTimeout(timeoutId);
        }
        this.scheduledEvents = [];
    }

    _stopAllInstruments() {
        for (const instrument of Object.values(this.instruments)) {
            if (instrument && instrument.stop) {
                instrument.stop();
            }
        }
    }

    clear() {
        this.stop();
        this.scheduledNotes.clear();
        this.notes = [];
        this.startOffset = 0;
        this.playbackPosition = 0;
    }

    finalize() {
        if (this.autoPlay && !this.isPlaying && this.scheduledNotes.size > 0) {
            this.play();
        }
    }

    setAutoPlay(enabled) {
        this.autoPlay = enabled;
    }

    setLoop(enabled) {
        this.isLooping = enabled;
    }

    setTempo(bpm) {
        this.tempo = bpm;
    }

    startTimeAnimation() {
        this.stopTimeAnimation();
        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.getCurrentTime(), this.getTotalDuration());
        }

        const tick = () => {
            const current = this.getCurrentTime();
            const total = this.getTotalDuration();

            if (this.isLooping && total > 0 && current >= total) {
                // Loop back to start
                this.playbackPosition = 0;
                this.playbackStartTime = this.context.currentTime;
                this._clearScheduledEvents();
                for (const note of this.notes) {
                    this._scheduleNotePlayback(note);
                }
            } else if (!this.isLooping && total > 0 && current >= total - 5) {
                // End of playback
                this.stopTimeAnimation();
                this.isPlaying = false;
                this.playbackPosition = total;
                if (this.onTimeUpdate) this.onTimeUpdate(total, total);
                if (this.onPlayStateChange) this.onPlayStateChange(false);
                return;
            }

            if (this.onTimeUpdate) {
                this.onTimeUpdate(current, total);
            }
            this.animationId = requestAnimationFrame(tick);
        };
        this.animationId = requestAnimationFrame(tick);
    }

    getCurrentTime() {
        if (!this.isPlaying) {
            return this.playbackPosition;
        }
        return (this.context.currentTime - this.playbackStartTime) * 1000;
    }

    getTotalDuration() {
        if (this.notes.length === 0) return 0;
        let maxEnd = 0;
        for (const note of this.notes) {
            const end = note.t + note.d;
            if (end > maxEnd) maxEnd = end;
        }
        return maxEnd;
    }

    seek(timeMs) {
        const wasPlaying = this.isPlaying;
        this._clearScheduledEvents();
        this._stopAllInstruments();
        this.playbackPosition = timeMs;

        if (wasPlaying) {
            this.playbackStartTime = this.context.currentTime - (timeMs / 1000);
            for (const note of this.notes) {
                this._scheduleNotePlayback(note);
            }
        }
    }

    stopTimeAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    setStartOffset(offsetMs) {
        this.startOffset = offsetMs;
    }

    getNotes() {
        return [...this.notes];
    }
}
