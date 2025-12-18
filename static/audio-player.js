// Progressive MIDI playback using Tone.js

class AudioPlayer {
    constructor() {
        this.synth = null;
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

        // Create a polyphonic synth with piano-like sound
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: 'triangle'
            },
            envelope: {
                attack: 0.02,
                decay: 0.3,
                sustain: 0.4,
                release: 0.8
            }
        }).toDestination();

        this.synth.volume.value = -6; // Reduce volume slightly
        this.initialized = true;
    }

    scheduleNote(note) {
        // Progressive scheduling - add notes as they arrive
        const noteId = `${note.t}-${note.n}-${note.d}`;
        if (this.scheduledNotes.has(noteId)) return;
        this.scheduledNotes.add(noteId);
        this.notes.push(note);

        const timeInSeconds = note.t / 1000;
        const durationInSeconds = Math.max(note.d / 1000, 0.05); // Min 50ms
        const noteName = Tone.Frequency(note.n, 'midi').toNote();
        const velocity = note.v / 127;

        // Schedule relative to transport
        Tone.Transport.schedule((time) => {
            if (this.synth) {
                this.synth.triggerAttackRelease(noteName, durationInSeconds, time, velocity);
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

    setTempo(bpm) {
        Tone.Transport.bpm.value = bpm;
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
