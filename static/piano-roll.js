// Canvas visualization of MIDI notes - horizontal piano roll

class PianoRoll {
    constructor(canvas, playheadCanvas, onSeek = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.playheadCanvas = playheadCanvas;
        this.playheadCtx = playheadCanvas.getContext('2d');
        this.onSeek = onSeek;

        this.notes = [];
        this.activeNotes = new Set();
        this.viewStart = 0;      // ms
        this.viewDuration = 8000; // 8 seconds visible
        this.noteRange = { min: 36, max: 96 }; // Piano range (C2 to C7)

        this.animationId = null;
        this.playheadTime = 0;

        // Colors
        this.colors = {
            background: '#1a1a2e',
            grid: '#2d2d44',
            gridLight: '#3d3d5c',
            note: '#4ecdc4',
            noteActive: '#ff6b6b',
            noteBorder: '#2a9d8f',
            playhead: '#ff6b6b',
            keyWhite: '#e8e8e8',
            keyBlack: '#2d2d44'
        };

        // Instrument color palette (HSL hues)
        this.instrumentColors = {
            0: { hue: 180, name: 'piano' },    // Cyan
            1: { hue: 30, name: 'bass' },      // Orange
            2: { hue: 270, name: 'strings' },  // Purple
            3: { hue: 60, name: 'lead' },      // Yellow
            4: { hue: 210, name: 'pad' },      // Blue
            5: { hue: 120, name: 'pluck' },    // Green
            6: { hue: 300, name: 'organ' },    // Magenta
            7: { hue: 0, name: 'drums' }       // Red
        };

        this.resize();
        this.initInteraction();
        this.drawPlayhead(0);
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.width = rect.width * dpr;
        this.height = rect.height * dpr;

        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.playheadCanvas.width = this.width;
        this.playheadCanvas.height = this.height;

        this.ctx.scale(dpr, dpr);
        this.playheadCtx.scale(dpr, dpr);

        this.displayWidth = rect.width;
        this.displayHeight = rect.height;

        // Calculate key dimensions
        this.keyWidth = 40;
        this.noteAreaWidth = this.displayWidth - this.keyWidth;
        this.noteHeight = this.displayHeight / (this.noteRange.max - this.noteRange.min);

        this.render();
        this.drawPlayhead(this.playheadTime || 0);
    }

    addNote(note) {
        this.notes.push(note);
        this.render();
    }

    setActiveNote(note, active) {
        const key = `${note.t}-${note.n}`;
        if (active) {
            this.activeNotes.add(key);
        } else {
            this.activeNotes.delete(key);
        }
        this.render();
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

        // Background
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);

        // Draw piano keys
        this.drawPianoKeys();

        // Draw grid
        this.drawGrid();

        // Draw notes
        for (const note of this.notes) {
            this.drawNote(note);
        }
    }

    drawPianoKeys() {
        const ctx = this.ctx;

        for (let n = this.noteRange.min; n < this.noteRange.max; n++) {
            const y = this.noteToY(n);
            const isBlack = this.isBlackKey(n);

            ctx.fillStyle = isBlack ? this.colors.keyBlack : this.colors.keyWhite;
            ctx.fillRect(0, y, this.keyWidth - 2, this.noteHeight);

            // Key border
            ctx.strokeStyle = this.colors.grid;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(0, y, this.keyWidth - 2, this.noteHeight);
        }
    }

    drawGrid() {
        const ctx = this.ctx;

        // Horizontal lines (pitch)
        for (let n = this.noteRange.min; n < this.noteRange.max; n++) {
            const y = this.noteToY(n);
            ctx.strokeStyle = this.isBlackKey(n) ? this.colors.grid : this.colors.gridLight;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(this.keyWidth, y);
            ctx.lineTo(this.displayWidth, y);
            ctx.stroke();
        }

        // Vertical lines (time - every 500ms)
        const gridInterval = 500;
        const startGrid = Math.floor(this.viewStart / gridInterval) * gridInterval;

        for (let t = startGrid; t < this.viewStart + this.viewDuration; t += gridInterval) {
            const x = this.timeToX(t);
            if (x < this.keyWidth) continue;

            ctx.strokeStyle = t % 1000 === 0 ? this.colors.gridLight : this.colors.grid;
            ctx.lineWidth = t % 1000 === 0 ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.displayHeight);
            ctx.stroke();
        }
    }

    drawNote(note) {
        const x = this.timeToX(note.t);
        const width = this.durationToWidth(note.d);
        const y = this.noteToY(note.n);
        const height = this.noteHeight - 1;

        // Skip if not visible
        if (x + width < this.keyWidth || x > this.displayWidth) return;

        const key = `${note.t}-${note.n}`;
        const isActive = this.activeNotes.has(key);

        const ctx = this.ctx;

        // Color based on instrument, with velocity affecting saturation
        const instrumentId = note.i ?? 0;
        const instrumentColor = this.instrumentColors[instrumentId] || this.instrumentColors[0];
        const hue = instrumentColor.hue;
        const saturation = 50 + (note.v / 127) * 30;
        const lightness = isActive ? 60 : 45;

        ctx.fillStyle = isActive ? this.colors.noteActive : `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.fillRect(Math.max(x, this.keyWidth), y, width, height);

        // Border
        ctx.strokeStyle = isActive ? '#fff' : `hsl(${hue}, ${saturation - 20}%, ${lightness - 10}%)`;
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.strokeRect(Math.max(x, this.keyWidth), y, width, height);
    }

    drawPlayhead(currentTime) {
        const ctx = this.playheadCtx;
        ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

        this.playheadTime = currentTime;
        const x = this.timeToX(currentTime);

        if (x < this.keyWidth || x > this.displayWidth) return;

        ctx.strokeStyle = this.colors.playhead;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.displayHeight);
        ctx.stroke();

        // Playhead triangle
        ctx.fillStyle = this.colors.playhead;
        ctx.beginPath();
        ctx.moveTo(x - 6, 0);
        ctx.lineTo(x + 6, 0);
        ctx.lineTo(x, 10);
        ctx.closePath();
        ctx.fill();
    }

    startAnimation(getTime) {
        const animate = () => {
            const time = getTime();
            this.autoScroll(time);
            this.drawPlayhead(time);
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    autoScroll(currentTime) {
        // Keep playhead visible
        const playheadX = this.timeToX(currentTime);
        const rightEdge = this.displayWidth * 0.8;
        const leftEdge = this.keyWidth + this.displayWidth * 0.2;

        if (playheadX > rightEdge) {
            this.viewStart = currentTime - this.viewDuration * 0.2;
            this.render();
        } else if (playheadX < leftEdge && this.viewStart > 0) {
            this.viewStart = Math.max(0, currentTime - this.viewDuration * 0.8);
            this.render();
        }
    }

    clear() {
        this.notes = [];
        this.activeNotes.clear();
        this.viewStart = 0;
        this.render();
        this.playheadCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    // Coordinate helpers
    timeToX(time) {
        return this.keyWidth + ((time - this.viewStart) / this.viewDuration) * this.noteAreaWidth;
    }

    durationToWidth(duration) {
        return (duration / this.viewDuration) * this.noteAreaWidth;
    }

    noteToY(note) {
        const range = this.noteRange.max - this.noteRange.min;
        // Invert so higher notes are at top
        return this.displayHeight - ((note - this.noteRange.min + 1) / range) * this.displayHeight;
    }

    isBlackKey(note) {
        const n = note % 12;
        return [1, 3, 6, 8, 10].includes(n);
    }

    // Set view to show all notes
    fitToNotes() {
        if (this.notes.length === 0) return;

        let minTime = Infinity;
        let maxTime = 0;

        for (const note of this.notes) {
            if (note.t < minTime) minTime = note.t;
            const end = note.t + note.d;
            if (end > maxTime) maxTime = end;
        }

        this.viewStart = Math.max(0, minTime - 500);
        this.viewDuration = Math.max(8000, maxTime - this.viewStart + 1000);
        this.render();
    }

    // Scroll to time
    scrollTo(timeMs) {
        this.viewStart = Math.max(0, timeMs - this.viewDuration * 0.2);
        this.render();
    }

    initInteraction() {
        if (!this.onSeek) return;

        let isDragging = false;

        const handleSeek = (e) => {
            const rect = this.playheadCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const time = this.xToTime(x);
            if (time >= 0) {
                this.onSeek(Math.max(0, time));
            }
        };

        const onDown = (e) => {
            isDragging = true;
            handleSeek(e);
            this.playheadCanvas.setPointerCapture(e.pointerId);
        };

        const onMove = (e) => {
            if (isDragging) {
                handleSeek(e);
            }
        };

        const onUp = (e) => {
            isDragging = false;
            this.playheadCanvas.releasePointerCapture(e.pointerId);
        };

        this.playheadCanvas.addEventListener('pointerdown', onDown);
        this.playheadCanvas.addEventListener('pointermove', onMove);
        this.playheadCanvas.addEventListener('pointerup', onUp);
        // Also handle pointer cancel/leave as up to clear state
        this.playheadCanvas.addEventListener('pointercancel', onUp);
    }

    xToTime(x) {
        const effectiveWidth = Math.max(1, this.noteAreaWidth);
        const ratio = (x - this.keyWidth) / effectiveWidth;
        return this.viewStart + ratio * this.viewDuration;
    }
}
