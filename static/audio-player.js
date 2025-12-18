// Progressive MIDI playback using Tone.js with multi-instrument support

// Instrument definitions with Tone.js synth configurations
const INSTRUMENTS = {
    0: {  // Piano
        name: 'piano',
        create: () => new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 }
        }),
        volume: -6
    },
    1: {  // Bass
        name: 'bass',
        create: () => new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.4 },
            filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.4, baseFrequency: 200, octaves: 2 }
        }),
        volume: -3
    },
    2: {  // Strings
        name: 'strings',
        create: () => new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.3, decay: 0.5, sustain: 0.7, release: 1.2 }
        }),
        volume: -8
    },
    3: {  // Lead
        name: 'lead',
        create: () => new Tone.MonoSynth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
            filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3, baseFrequency: 800, octaves: 3 }
        }),
        volume: -6
    },
    4: {  // Pad
        name: 'pad',
        create: () => new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.8, decay: 1.0, sustain: 0.9, release: 2.0 }
        }),
        volume: -10
    },
    5: {  // Pluck
        name: 'pluck',
        create: () => new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.001, decay: 0.2, sustain: 0.1, release: 0.3 }
        }),
        volume: -6
    },
    6: {  // Organ
        name: 'organ',
        create: () => new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine', partialCount: 4, partials: [1, 0.5, 0.25, 0.125] },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.9, release: 0.5 }
        }),
        volume: -8
    },
    7: {  // Drums
        name: 'drums',
        create: () => new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 4,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 }
        }),
        volume: -4
    }
};

class AudioPlayer {
    constructor() {
        this.synths = {};  // Map of instrument ID to synth
        this.scheduledNotes = new Set();
        this.notes = [];
        this.isPlaying = false;
        this.autoPlay = true;
        this.isLooping = false;
        this.startOffset = 0;
        this.onNoteStart = null;
        this.onNoteEnd = null;
        this.onTimeUpdate = null;
        this.animationId = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Create all instrument synths (use numeric keys)
        for (let id = 0; id <= 7; id++) {
            const config = INSTRUMENTS[id];
            const synth = config.create();
            synth.volume.value = config.volume;
            synth.toDestination();
            this.synths[id] = synth;
        }

        this.initialized = true;
    }

    getSynth(instrumentId) {
        // Default to piano (0) for unknown instruments
        const id = (instrumentId in this.synths) ? instrumentId : 0;
        return this.synths[id];
    }

    scheduleNote(note) {
        // Include instrument in note ID for uniqueness
        const instrumentId = note.i ?? 0;
        const noteId = `${note.t}-${note.n}-${note.d}-${instrumentId}`;
        if (this.scheduledNotes.has(noteId)) return;
        this.scheduledNotes.add(noteId);
        this.notes.push(note);

        const timeInSeconds = note.t / 1000;
        const durationInSeconds = Math.max(note.d / 1000, 0.05); // Min 50ms
        const noteName = Tone.Frequency(note.n, 'midi').toNote();
        const velocity = note.v / 127;

        // Schedule relative to transport
        Tone.Transport.schedule((time) => {
            // Look up synth at playback time (after init)
            const synth = this.getSynth(instrumentId);
            if (synth) {
                synth.triggerAttackRelease(noteName, durationInSeconds, time, velocity);
            }
            if (this.onNoteStart) {
                Tone.Draw.schedule(() => this.onNoteStart(note), time);
            }

            // Schedule note end callback
            Tone.Transport.schedule((endTime) => {
                if (this.onNoteEnd) {
                    Tone.Draw.schedule(() => this.onNoteEnd(note), endTime);
                }
            }, time + durationInSeconds);
        }, timeInSeconds);

        // Auto-start playback on first note if autoPlay enabled
        if (this.autoPlay && !this.isPlaying && this.scheduledNotes.size === 1) {
            this.play();
        }
    }

    async play() {
        await this.init();
        await Tone.start();
        this.isPlaying = true;
        Tone.Transport.start();
        this.startTimeAnimation();
    }

    pause() {
        this.isPlaying = false;
        Tone.Transport.pause();
        this.stopTimeAnimation();
    }

    stop() {
        this.isPlaying = false;
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        this.stopTimeAnimation();
    }

    clear() {
        this.stop();
        Tone.Transport.cancel();
        this.scheduledNotes.clear();
        this.notes = [];
        this.startOffset = 0;
    }

    finalize() {
        // Called when generation complete
        // If autoPlay enabled and not playing, start now
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
        Tone.Transport.bpm.value = bpm;
    }

    startTimeAnimation() {
        // Animation is handled by PianoRoll
    }

    getCurrentTime() {
        // Compensate for lookahead latency to match visual playhead with audible sound
        const lookAhead = Tone.context ? (Tone.context.lookAhead || 0) : 0;
        const time = Math.max(0, (Tone.Transport.seconds - lookAhead) * 1000);
        return isNaN(time) ? 0 : time;
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
        Tone.Transport.seconds = timeMs / 1000;
        if (wasPlaying && Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
    }

    stopTimeAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // Set start offset for refinement mode
    setStartOffset(offsetMs) {
        this.startOffset = offsetMs;
    }

    // Get notes for export
    getNotes() {
        return [...this.notes];
    }
}
