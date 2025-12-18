// Progressive MIDI playback using Tone.js with multi-instrument support

// Instrument definitions with Tone.js synth configurations
// Base URL for instrument samples
// Using the excellent collection from nbrosowsky/tonejs-instruments
const SAMPLE_BASE_URL = "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/";

const INSTRUMENTS = {
    0: {  // Piano
        name: 'piano',
        create: () => new Tone.Sampler({
            urls: {
                "A1": "A1.mp3", "A2": "A2.mp3", "A3": "A3.mp3", "A4": "A4.mp3", "A5": "A5.mp3", "A6": "A6.mp3", "A7": "A7.mp3",
                "C1": "C1.mp3", "C2": "C2.mp3", "C3": "C3.mp3", "C4": "C4.mp3", "C5": "C5.mp3", "C6": "C6.mp3", "C7": "C7.mp3",
                "D#1": "Ds1.mp3", "D#2": "Ds2.mp3", "D#3": "Ds3.mp3", "D#4": "Ds4.mp3", "D#5": "Ds5.mp3", "D#6": "Ds6.mp3", "D#7": "Ds7.mp3",
                "F#1": "Fs1.mp3", "F#2": "Fs2.mp3", "F#3": "Fs3.mp3", "F#4": "Fs4.mp3", "F#5": "Fs5.mp3", "F#6": "Fs6.mp3", "F#7": "Fs7.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "piano/"
        }),
        volume: -5
    },
    1: {  // Bass
        name: 'bass',
        create: () => new Tone.Sampler({
            urls: {
                "A#1": "As1.mp3", "A#2": "As2.mp3", "A#3": "As3.mp3", "A#4": "As4.mp3",
                "C#1": "Cs1.mp3", "C#2": "Cs2.mp3", "C#3": "Cs3.mp3", "C#4": "Cs4.mp3",
                "E1": "E1.mp3", "E2": "E2.mp3", "E3": "E3.mp3", "E4": "E4.mp3",
                "G1": "G1.mp3", "G2": "G2.mp3", "G3": "G3.mp3", "G4": "G4.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "bass-electric/"
        }),
        volume: -3
    },
    2: {  // Strings (Violin)
        name: 'strings',
        create: () => new Tone.Sampler({
            urls: {
                "A3": "A3.mp3", "A4": "A4.mp3", "A5": "A5.mp3", "A6": "A6.mp3",
                "C4": "C4.mp3", "C5": "C5.mp3", "C6": "C6.mp3", "C7": "C7.mp3",
                "E4": "E4.mp3", "E5": "E5.mp3", "E6": "E6.mp3",
                "G4": "G4.mp3", "G5": "G5.mp3", "G6": "G6.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "violin/"
        }),
        volume: -6
    },
    3: {  // Lead (Saxophone)
        name: 'lead',
        create: () => new Tone.Sampler({
            urls: {
                "D#5": "Ds5.mp3", "E3": "E3.mp3", "E4": "E4.mp3", "E5": "E5.mp3",
                "F3": "F3.mp3", "F4": "F4.mp3", "F5": "F5.mp3", "F#3": "Fs3.mp3", "F#4": "Fs4.mp3", "F#5": "Fs5.mp3",
                "G3": "G3.mp3", "G4": "G4.mp3", "G5": "G5.mp3", "A4": "A4.mp3", "A5": "A5.mp3",
                "C4": "C4.mp3", "C5": "C5.mp3", "D3": "D3.mp3", "D4": "D4.mp3", "D5": "D5.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "saxophone/"
        }),
        volume: -5
    },
    4: {  // Pad (Harmonium)
        name: 'pad',
        create: () => new Tone.Sampler({
            urls: {
                "C2": "C2.mp3", "C3": "C3.mp3", "C4": "C4.mp3", "C5": "C5.mp3",
                "D#2": "Ds2.mp3", "D#3": "Ds3.mp3", "D#4": "Ds4.mp3",
                "F#2": "Fs2.mp3", "F#3": "Fs3.mp3", "A2": "A2.mp3", "A3": "A3.mp3", "A4": "A4.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "harmonium/"
        }),
        volume: -8
    },
    5: {  // Pluck (Guitar Acoustic)
        name: 'pluck',
        create: () => new Tone.Sampler({
            urls: {
                "F4": "F4.mp3", "F#2": "Fs2.mp3", "F#3": "Fs3.mp3", "F#4": "Fs4.mp3",
                "G2": "G2.mp3", "G3": "G3.mp3", "G4": "G4.mp3",
                "A2": "A2.mp3", "A3": "A3.mp3", "A4": "A4.mp3",
                "C3": "C3.mp3", "C4": "C4.mp3", "C5": "C5.mp3",
                "D2": "D2.mp3", "D3": "D3.mp3", "D4": "D4.mp3",
                "E2": "E2.mp3", "E3": "E3.mp3", "E4": "E4.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "guitar-acoustic/"
        }),
        volume: -5
    },
    6: {  // Organ
        name: 'organ',
        create: () => new Tone.Sampler({
            urls: {
                "C3": "C3.mp3", "C4": "C4.mp3", "C5": "C5.mp3", "C6": "C6.mp3",
                "D#1": "Ds1.mp3", "D#2": "Ds2.mp3", "D#3": "Ds3.mp3", "D#4": "Ds4.mp3", "D#5": "Ds5.mp3",
                "F#1": "Fs1.mp3", "F#2": "Fs2.mp3", "F#3": "Fs3.mp3", "F#4": "Fs4.mp3", "F#5": "Fs5.mp3",
                "A1": "A1.mp3", "A2": "A2.mp3", "A3": "A3.mp3", "A4": "A4.mp3", "A5": "A5.mp3"
            },
            release: 1,
            baseUrl: SAMPLE_BASE_URL + "organ/"
        }),
        volume: -6
    },
    7: {  // Drums - Revert to Synth as no good samples found
        name: 'drums',
        create: () => new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 4,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 }
        }),
        volume: -2
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
        this.onPlayStateChange = null;
        this.animationId = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Initialize global reverb
        if (!this.reverb) {
            this.reverb = new Tone.Reverb({
                decay: 2.5,
                wet: 0.2
            }).toDestination();
            await this.reverb.generate();
        }

        // Initialize compressor for master mix glue
        if (!this.compressor) {
            this.compressor = new Tone.Compressor({
                threshold: -10,
                ratio: 4,
                attack: 0.01,
                release: 0.2
            }).connect(this.reverb);
        }

        // Create all instrument synths (use numeric keys)
        for (let id = 0; id <= 7; id++) {
            const config = INSTRUMENTS[id];
            const synth = config.create();
            synth.volume.value = config.volume;
            // Connect to compressor for mix control, passing through reverb
            synth.connect(this.compressor);
            this.synths[id] = synth;
        }

        await Tone.loaded();
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

        this.syncLoopPoints();
    }

    async play() {
        await this.init();
        await Tone.start();
        this.isPlaying = true;
        Tone.Transport.start();
        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }
        this.startTimeAnimation();
    }

    pause() {
        this.isPlaying = false;
        Tone.Transport.pause();
        this.stopTimeAnimation();
        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.getCurrentTime(), this.getTotalDuration());
        }
        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }
    }

    stop() {
        this.isPlaying = false;
        Tone.Transport.stop();
        Tone.Transport.seconds = 0;
        this.stopTimeAnimation();
        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }
        if (this.onTimeUpdate) {
            this.onTimeUpdate(0, this.getTotalDuration());
        }
    }

    clear() {
        this.stop();
        Tone.Transport.cancel();
        this.scheduledNotes.clear();
        this.notes = [];
        this.startOffset = 0;
        Tone.Transport.loop = false;
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
        this.syncLoopPoints();
    }

    setTempo(bpm) {
        Tone.Transport.bpm.value = bpm;
    }

    startTimeAnimation() {
        this.stopTimeAnimation();
        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.getCurrentTime(), this.getTotalDuration());
        }
        const tick = () => {
            const current = this.getCurrentTime();
            const total = this.getTotalDuration();

            if (!this.isLooping && total > 0 && current >= total - 5) {
                // Snap to end and pause transport so the playhead stops at song end
                this.stopTimeAnimation();
                Tone.Transport.pause();
                Tone.Transport.seconds = total / 1000;
                this.isPlaying = false;
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

    syncLoopPoints() {
        const totalSeconds = this.getTotalDuration() / 1000;
        const shouldLoop = this.isLooping && totalSeconds > 0;
        Tone.Transport.loop = shouldLoop;
        if (shouldLoop) {
            Tone.Transport.loopStart = 0;
            Tone.Transport.loopEnd = totalSeconds;
        }
    }
}
