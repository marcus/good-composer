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

        // Colors (Logic Pro X inspired)
        this.colors = {
            background: '#1e1e1e',
            grid: '#2d2d2d',
            gridLight: '#3d3d3d',
            note: '#2980b9', // Default blue
            noteActive: '#ffffff',
            noteBorder: 'rgba(0,0,0,0.3)',
            playhead: '#ffffff',
            keyWhite: '#b0b0b0',
            keyBlack: '#1a1a1a'
        };

        // Instrument color palette (HSL hues) - will be updated based on selected bank
        this.instrumentHues = {
            0: 180, 1: 30, 2: 270, 3: 60, 4: 210, 5: 120, 6: 300, 7: 0
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

        // Reset transforms before scaling to avoid compounding on repeated resizes
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.playheadCtx.setTransform(1, 0, 0, 1, 0, 0);
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
        const noteStart = note.t;
        const noteEnd = note.t + note.d;
        const viewEnd = this.viewStart + this.viewDuration;

        // Skip if note is completely outside the viewport
        if (noteEnd <= this.viewStart || noteStart >= viewEnd) return;

        // Clip long notes so they shrink smoothly as they exit the view
        const visibleStart = Math.max(noteStart, this.viewStart);
        const visibleEnd = Math.min(noteEnd, viewEnd);

        const x = this.timeToX(visibleStart);
        const width = this.durationToWidth(visibleEnd - visibleStart);
        const y = this.noteToY(note.n);
        const height = Math.max(1, this.noteHeight - 1);

        const key = `${note.t}-${note.n}`;
        const isActive = this.activeNotes.has(key);

        const ctx = this.ctx;

        // Color based on instrument with velocity brightness
        let fillStyle;
        if (isActive) {
            fillStyle = this.colors.noteActive;
        } else {
            const instrumentId = note.i ?? 0;
            const hue = this.instrumentHues[instrumentId] ?? 180;
            const v = Math.max(1, Math.min(127, note.v || 80));
            // Higher velocity = more saturation and brightness
            const sat = 50 + (v / 127) * 30;
            const light = 40 + (v / 127) * 20;
            fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
        }

        ctx.fillStyle = fillStyle;
        ctx.fillRect(Math.max(x, this.keyWidth), y, width, height);

        // Border (subtle inner border)
        ctx.strokeStyle = isActive ? '#000' : 'rgba(0,0,0,0.2)';
        ctx.lineWidth = isActive ? 1 : 0.5;
        ctx.strokeRect(Math.max(x, this.keyWidth), y, width, height);
    }

    drawPlayhead(currentTime, { ensureVisible = true } = {}) {
        const safeTime = this.normalizeTime(currentTime);
        if (ensureVisible) {
            this.ensureTimeVisible(safeTime);
        }

        const ctx = this.playheadCtx;
        ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

        this.playheadTime = safeTime;
        let x = this.timeToX(safeTime);

        // If time is still outside the viewport, pin the indicator to the nearest edge
        if (x < this.keyWidth) x = this.keyWidth;
        if (x > this.displayWidth) x = this.displayWidth;

        // Line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.displayHeight);
        ctx.stroke();

        // Playhead triangle (Logic style)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - 8, 0);
        ctx.lineTo(x + 8, 0);
        ctx.lineTo(x, 12);
        ctx.closePath();
        ctx.fill();
    }

    startAnimation(getTime) {
        // Stop any existing animation first to prevent duplicates
        this.stopAnimation();

        const animate = () => {
            const time = this.normalizeTime(getTime ? getTime() : 0);
            this.drawPlayhead(time, { ensureVisible: true });
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

    clear() {
        this.notes = [];
        this.activeNotes.clear();
        this.viewStart = 0;
        this.playheadTime = 0;
        this.render();
        this.playheadCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    updateHues(hues) {
        if (hues && typeof hues === 'object') {
            this.instrumentHues = { ...this.instrumentHues, ...hues };
        }
    }

    draw() {
        this.render();
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
        this.drawPlayhead(this.playheadTime || 0, { ensureVisible: true });
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
            if (this.playheadCanvas.hasPointerCapture(e.pointerId)) {
                this.playheadCanvas.releasePointerCapture(e.pointerId);
            }
        };

        this.playheadCanvas.addEventListener('pointerdown', onDown);
        this.playheadCanvas.addEventListener('pointermove', onMove);
        this.playheadCanvas.addEventListener('pointerup', onUp);
        // Also handle pointer cancel/leave as up to clear state
        this.playheadCanvas.addEventListener('pointercancel', onUp);
        this.playheadCanvas.addEventListener('pointerleave', onUp);
    }

    xToTime(x) {
        const effectiveWidth = Math.max(1, this.noteAreaWidth);
        const ratio = (x - this.keyWidth) / effectiveWidth;
        return this.viewStart + ratio * this.viewDuration;
    }

    normalizeTime(timeMs) {
        const t = Number(timeMs);
        return Number.isFinite(t) && t >= 0 ? t : 0;
    }

    ensureTimeVisible(timeMs) {
        const margin = this.viewDuration * 0.1;
        const leftBound = this.viewStart + margin;
        const rightBound = this.viewStart + this.viewDuration - margin;

        if (timeMs < leftBound) {
            this.viewStart = Math.max(0, timeMs - margin);
            this.render();
        } else if (timeMs > rightBound) {
            this.viewStart = Math.max(0, timeMs - (this.viewDuration - margin));
            this.render();
        }
    }
}
