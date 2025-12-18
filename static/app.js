// Good Composer - WebSocket client for AI music generation with streaming playback

const DEBOUNCE_MS = 1500;
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAYS = [500, 2000, 5000, 10000];
const DEBUG = new URLSearchParams(location.search).has('debug');

class ComposerApp {
    constructor() {
        // Canvas elements
        this.pianoRollCanvas = document.getElementById('piano-roll');
        this.playheadCanvas = document.getElementById('playhead');
        this.loadingCanvas = document.getElementById('loading-canvas');

        // Controls
        this.input = document.getElementById('prompt');
        this.clearBtn = document.getElementById('clear-btn');
        this.refineBtn = document.getElementById('refine-btn');
        this.modelSelect = document.getElementById('model-select');
        this.status = document.getElementById('status');
        this.thinkingOverlay = document.getElementById('thinking-overlay');

        // Transport controls
        this.playPauseBtn = document.getElementById('play-pause');
        this.stopBtn = document.getElementById('stop');
        this.timeDisplay = document.getElementById('time-display');
        this.tempoSlider = document.getElementById('tempo');
        this.tempoDisplay = document.getElementById('tempo-display');
        this.autoPlayCheckbox = document.getElementById('auto-play');

        // State
        this.ws = null;
        this.currentId = null;
        this.debounceTimer = null;
        this.pingTimer = null;
        this.reconnectAttempt = 0;
        this.thinkingText = '';

        // Refinement state
        this.hasCompletedComposition = false;
        this.isRefineMode = false;
        this.isActuallyRefining = false;

        // Gallery state
        this.galleryItems = [];
        this.maxGalleryItems = 15;
        this.galleryScroll = document.getElementById('gallery-scroll');
        this.currentPromptForGallery = '';

        // State machine: 'idle' | 'waiting' | 'thinking' | 'generating' | 'playing'
        this.state = 'idle';
        this.startTime = null;
        this.elapsedTimer = null;

        // Initialize components
        this.pianoRoll = new PianoRoll(
            this.pianoRollCanvas,
            this.playheadCanvas,
            (time) => {
                this.player.seek(time);
                this.pianoRoll.drawPlayhead(time);
            }
        );
        this.player = new AudioPlayer();
        this.parser = new MidiParser(
            (note) => this.onNote(note),
            (warning) => this.logWarning(warning)
        );
        this.loader = new MusicLoader(this.loadingCanvas);

        // Wire up player callbacks
        this.player.onNoteStart = (note) => this.pianoRoll.setActiveNote(note, true);
        this.player.onNoteEnd = (note) => this.pianoRoll.setActiveNote(note, false);
        this.player.onTimeUpdate = (current, total) => this.updateTimeDisplay(current, total);

        this.init();
    }

    init() {
        // Input handlers
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));
        this.clearBtn.addEventListener('click', () => this.clearInput());
        this.refineBtn.addEventListener('click', () => this.toggleRefineMode());

        // Transport handlers
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.stopBtn.addEventListener('click', () => this.stopPlayback());
        document.getElementById('loop-btn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const isLooping = btn.classList.toggle('active');
            this.player.setLoop(isLooping);
        });
        this.tempoSlider.addEventListener('input', () => this.updateTempo());
        this.autoPlayCheckbox.addEventListener('change', () => {
            this.player.setAutoPlay(this.autoPlayCheckbox.checked);
        });

        // Resize handler
        window.addEventListener('resize', () => {
            this.pianoRoll.resize();
            this.loader.resize();
        });

        this.loadGalleryFromSession();
        this.fetchModels();
        this.connect();
    }

    onNote(note) {
        this.startGenerating();
        this.pianoRoll.addNote(note);
        this.player.scheduleNote(note);
    }

    logWarning(warning) {
        if (DEBUG) {
            console.warn('[MidiParser]', warning.type, warning.details);
        }
    }

    toggleRefineMode() {
        if (!this.hasCompletedComposition) return;

        this.isRefineMode = !this.isRefineMode;
        this.refineBtn.classList.toggle('active', this.isRefineMode);

        if (this.isRefineMode) {
            this.input.placeholder = 'Add to composition...';
            this.input.value = '';
            this.clearBtn.classList.add('hidden');
        } else {
            this.input.placeholder = 'Describe your music...';
        }

        this.input.focus();
    }

    async fetchModels() {
        try {
            const resp = await fetch('/api/models');
            const data = await resp.json();
            const models = data.models || [];

            this.modelSelect.innerHTML = '';
            if (models.length === 0) {
                this.modelSelect.innerHTML = '<option value="">No models</option>';
                return;
            }

            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ name: m.name, provider: m.provider, maxTokens: m.maxTokens });
                const icon = m.provider === 'ollama' ? '&#x1F4BB;' : '&#x2601;';
                const displayName = m.displayName || m.name.split('/').pop().split(':')[0];
                opt.innerHTML = `${icon} ${displayName}`;
                this.modelSelect.appendChild(opt);
            });

            // Select Gemini 3 Flash by default
            const preferred = models.find(m => m.name.includes('gemini-3-flash'));
            if (preferred) {
                this.modelSelect.value = JSON.stringify({ name: preferred.name, provider: preferred.provider });
            }
        } catch (e) {
            console.warn('Failed to fetch models:', e);
            this.modelSelect.innerHTML = '<option value="">Error</option>';
        }
    }

    // State management
    startLoading() {
        this.state = 'waiting';
        this.loader.start();
        this.startTime = Date.now();
        this.updateElapsed();
        this.elapsedTimer = setInterval(() => this.updateElapsed(), 100);
    }

    startThinking() {
        if (this.state === 'waiting') {
            this.state = 'thinking';
        }
    }

    startGenerating() {
        if (this.state === 'waiting' || this.state === 'thinking') {
            this.state = 'generating';
            this.loader.stop();

            // Start piano roll animation
            this.pianoRoll.startAnimation(() => this.player.getCurrentTime());
        }
    }

    stopAll() {
        this.state = 'idle';
        this.loader.stop();
        this.pianoRoll.stopAnimation();
        if (this.elapsedTimer) {
            clearInterval(this.elapsedTimer);
            this.elapsedTimer = null;
        }
        this.isActuallyRefining = false;
    }

    updateElapsed() {
        if (!this.startTime) return;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        switch (this.state) {
            case 'waiting':
                this.setStatus(`Waiting... ${elapsed}s`);
                break;
            case 'thinking':
                this.setStatus(`Thinking... ${elapsed}s`);
                break;
            case 'generating':
                this.setStatus(`Generating... ${elapsed}s`);
                break;
        }
    }

    // WebSocket connection
    connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/compose`;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            this.reconnectAttempt = 0;
            this.setStatus('');
            this.startPing();
            // Reset state on reconnect
            this.hasCompletedComposition = false;
            this.isRefineMode = false;
            this.isActuallyRefining = false;
            this.refineBtn.disabled = true;
            this.refineBtn.classList.remove('active');
            this.input.placeholder = 'Describe your music...';
        };

        this.ws.onclose = () => {
            this.stopPing();
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            this.setStatus('Connection error', true);
        };

        this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
    }

    scheduleReconnect() {
        const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
        this.setStatus('Reconnecting...');
        this.reconnectAttempt++;
        setTimeout(() => this.connect(), delay);
    }

    startPing() {
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, PING_INTERVAL_MS);
    }

    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    handleMessage(msg) {
        if (msg.id && msg.id !== this.currentId) return;

        switch (msg.type) {
            case 'pong':
                break;

            case 'start':
                this.parser.reset();
                if (!this.isActuallyRefining) {
                    this.player.clear();
                    this.pianoRoll.clear();
                }
                this.setStatus('');
                break;

            case 'thinking':
                if (DEBUG) console.log('[thinking]', msg.data);
                this.startThinking();
                this.thinkingText += msg.data;
                this.thinkingOverlay.textContent = this.thinkingText;
                this.thinkingOverlay.classList.remove('fade-out');
                this.thinkingOverlay.classList.add('visible');
                break;

            case 'chunk':
                // First content chunk - fade out thinking
                if (this.thinkingText && !this.thinkingOverlay.classList.contains('fade-out')) {
                    this.thinkingOverlay.classList.add('fade-out');
                    setTimeout(() => {
                        this.thinkingOverlay.classList.remove('visible');
                        this.thinkingText = '';
                        this.thinkingOverlay.textContent = '';
                    }, 500);
                }
                if (DEBUG) console.log('[chunk]', msg.data);
                this.parser.feed(msg.data);
                break;

            case 'done':
                this.stopAll();
                this.setStatus('');
                this.player.finalize();
                this.addToGallery();
                this.hasCompletedComposition = true;
                this.refineBtn.disabled = false;
                // Clear input in refine mode
                if (this.isRefineMode) {
                    this.input.value = '';
                    this.clearBtn.classList.add('hidden');
                }
                // Update playback button
                this.updatePlayPauseButton();
                break;

            case 'session_cleared':
                this.hasCompletedComposition = false;
                this.isRefineMode = false;
                this.refineBtn.disabled = true;
                this.refineBtn.classList.remove('active');
                this.input.placeholder = 'Describe your music...';
                break;

            case 'cancelled':
                this.stopAll();
                this.setStatus('');
                break;

            case 'error':
                this.stopAll();
                this.setStatus(msg.message, true);
                setTimeout(() => {
                    if (this.status.textContent === msg.message) {
                        this.setStatus('');
                    }
                }, 3000);
                break;
        }
    }

    // Input handlers
    onInput() {
        const value = this.input.value;
        this.clearBtn.classList.toggle('hidden', !value);

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        if (!value.trim()) {
            if (!this.isRefineMode || !this.hasCompletedComposition) {
                this.clearComposition();
            }
            return;
        }

        // Only auto-compose for new compositions, not refinements
        if (!this.isRefineMode) {
            this.debounceTimer = setTimeout(() => this.sendCompose(), DEBOUNCE_MS);
        }
    }

    onKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.sendCompose();
        } else if (e.key === 'Escape') {
            if (this.isRefineMode) {
                this.isRefineMode = false;
                this.refineBtn.classList.remove('active');
                this.input.value = '';
                this.clearBtn.classList.add('hidden');
                this.input.placeholder = 'Describe your music...';
            } else {
                this.clearInput();
            }
        }
    }

    sendCompose() {
        const prompt = this.input.value.trim();
        if (!prompt) return;

        this.currentPromptForGallery = prompt;

        if (prompt.length > 512) {
            this.setStatus('Prompt too long (max 512 chars)', true);
            return;
        }

        // Determine if refining
        const isRefinement = this.isRefineMode && this.hasCompletedComposition;
        this.isActuallyRefining = isRefinement;

        // Cancel current request
        this.cancel();

        if (!isRefinement) {
            // New composition
            this.player.clear();
            this.pianoRoll.clear();
            this.parser.reset();
            this.hasCompletedComposition = false;
            this.refineBtn.disabled = true;
        }

        this.thinkingText = '';
        this.thinkingOverlay.textContent = '';
        this.thinkingOverlay.classList.remove('fade-out', 'visible');
        this.startLoading();

        this.currentId = crypto.randomUUID();

        if (this.ws?.readyState === WebSocket.OPEN) {
            let model = 'google/gemini-3-flash-preview';
            let provider = 'openrouter';
            let maxTokens = 100000;
            try {
                const selected = JSON.parse(this.modelSelect.value);
                model = selected.name;
                provider = selected.provider;
                if (selected.maxTokens) maxTokens = selected.maxTokens;
            } catch (e) { }

            this.ws.send(JSON.stringify({
                type: 'compose',
                prompt: prompt,
                id: this.currentId,
                model: model,
                provider: provider,
                maxTokens: maxTokens,
                refine: isRefinement
            }));
        } else {
            this.setStatus('Not connected', true);
        }
    }

    cancel() {
        if (this.currentId && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'cancel',
                id: this.currentId
            }));
        }
    }

    clearInput() {
        this.input.value = '';
        this.clearBtn.classList.add('hidden');
        this.cancel();
        this.clearComposition();

        // Reset refinement state
        this.hasCompletedComposition = false;
        this.isRefineMode = false;
        this.refineBtn.disabled = true;
        this.refineBtn.classList.remove('active');
        this.input.placeholder = 'Describe your music...';

        // Notify server
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'clear_session' }));
        }

        // Clear gallery selection
        this.galleryScroll.querySelectorAll('.gallery-item.active').forEach(el => {
            el.classList.remove('active');
        });

        this.input.focus();
    }

    clearComposition() {
        this.stopAll();
        this.player.clear();
        this.pianoRoll.clear();
        this.pianoRoll.drawPlayhead(0);  // Clear playhead
        this.parser.reset();
        this.thinkingText = '';
        this.thinkingOverlay.textContent = '';
        this.thinkingOverlay.classList.remove('fade-out', 'visible');
        this.currentId = null;
        this.updatePlayPauseButton();
        this.updateTimeDisplay(0, 0);
    }

    // Transport controls
    togglePlayPause() {
        if (this.player.isPlaying) {
            this.player.pause();
            this.pianoRoll.stopAnimation();
        } else {
            this.player.play();
            // Restart piano roll animation when playing
            this.pianoRoll.startAnimation(() => this.player.getCurrentTime());
        }
        this.updatePlayPauseButton();
    }

    stopPlayback() {
        this.player.stop();
        this.pianoRoll.stopAnimation();
        this.pianoRoll.scrollTo(0);
        this.pianoRoll.drawPlayhead(0);  // Reset playhead to beginning
        this.updatePlayPauseButton();
        this.updateTimeDisplay(0, this.player.getTotalDuration());
    }

    updatePlayPauseButton() {
        this.playPauseBtn.innerHTML = this.player.isPlaying
            ? '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>'
            : '<svg viewBox="0 0 24 24" width="20" height="20"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
    }

    updateTempo() {
        const bpm = parseInt(this.tempoSlider.value);
        this.tempoDisplay.textContent = `${bpm} BPM`;
        this.player.setTempo(bpm);
    }

    updateTimeDisplay(currentMs, totalMs) {
        const formatTime = (ms) => {
            const s = Math.floor(ms / 1000);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        this.timeDisplay.textContent = `${formatTime(currentMs)} / ${formatTime(totalMs)}`;
    }

    setStatus(text, isError = false) {
        this.status.textContent = text;
        this.status.classList.toggle('error', isError);
    }

    // Gallery
    truncatePrompt(prompt, maxLen = 25) {
        if (prompt.length <= maxLen) return prompt;
        return prompt.slice(0, maxLen - 1) + '...';
    }

    saveGalleryToSession() {
        try {
            sessionStorage.setItem('composerGallery', JSON.stringify(this.galleryItems));
        } catch (e) {
            console.warn('Failed to save gallery:', e);
            if (e.name === 'QuotaExceededError') {
                while (this.galleryItems.length > 1) {
                    this.galleryItems.pop();
                    try {
                        sessionStorage.setItem('composerGallery', JSON.stringify(this.galleryItems));
                        this.renderGallery();
                        return;
                    } catch (e2) { }
                }
                this.galleryItems = [];
                this.renderGallery();
            }
        }
    }

    loadGalleryFromSession() {
        try {
            const data = sessionStorage.getItem('composerGallery');
            if (data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    this.galleryItems = parsed.filter(item =>
                        item && item.id && item.prompt && Array.isArray(item.midiData)
                    );
                }
                this.renderGallery();
            }
        } catch (e) {
            console.warn('Failed to load gallery:', e);
            this.galleryItems = [];
        }
    }

    addToGallery() {
        const prompt = this.currentPromptForGallery || this.input.value.trim();
        if (!prompt) return;

        const notes = this.parser.getNotes();
        if (notes.length === 0) return;

        const selectedOption = this.modelSelect.options[this.modelSelect.selectedIndex];
        const modelName = selectedOption ? selectedOption.textContent.replace(/^[^\s]+\s/, '') : 'Unknown';

        const item = {
            id: crypto.randomUUID(),
            midiData: notes,
            prompt: prompt,
            modelName: modelName,
            timestamp: Date.now(),
            duration: this.parser.getEndTime(),
            tempo: parseInt(this.tempoSlider.value)
        };

        this.galleryItems.unshift(item);

        if (this.galleryItems.length > this.maxGalleryItems) {
            this.galleryItems.pop();
        }

        this.saveGalleryToSession();
        this.renderGallery();
    }

    renderGallery() {
        this.galleryScroll.innerHTML = '';
        const wrapper = document.getElementById('gallery-wrapper');
        wrapper.classList.toggle('empty', this.galleryItems.length === 0);

        this.galleryItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.dataset.id = item.id;

            // Mini visualization
            const thumb = document.createElement('div');
            thumb.className = 'gallery-thumb';
            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 80;
            miniCanvas.height = 50;
            this.drawMiniPianoRoll(miniCanvas, item.midiData);
            thumb.appendChild(miniCanvas);

            const meta = document.createElement('div');
            meta.className = 'gallery-meta';
            const promptSpan = document.createElement('span');
            promptSpan.className = 'gallery-prompt';
            promptSpan.title = item.prompt;
            promptSpan.textContent = this.truncatePrompt(item.prompt);
            const modelSpan = document.createElement('span');
            modelSpan.className = 'gallery-model';
            modelSpan.textContent = item.modelName;
            meta.appendChild(promptSpan);
            meta.appendChild(modelSpan);

            div.appendChild(thumb);
            div.appendChild(meta);
            div.addEventListener('click', () => this.loadFromGallery(item));
            this.galleryScroll.appendChild(div);
        });
    }

    drawMiniPianoRoll(canvas, notes) {
        if (notes.length === 0) return;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Instrument color hues
        const instrumentHues = {
            0: 180, 1: 30, 2: 270, 3: 60, 4: 210, 5: 120, 6: 300, 7: 0
        };

        // Find bounds
        let minNote = 127, maxNote = 0, maxTime = 0;
        for (const note of notes) {
            if (note.n < minNote) minNote = note.n;
            if (note.n > maxNote) maxNote = note.n;
            const end = note.t + note.d;
            if (end > maxTime) maxTime = end;
        }

        const noteRange = Math.max(maxNote - minNote + 1, 12);
        const timeScale = canvas.width / maxTime;
        const noteScale = canvas.height / noteRange;

        // Draw notes with instrument colors
        for (const note of notes) {
            const x = note.t * timeScale;
            const width = Math.max(note.d * timeScale, 1);
            const y = canvas.height - (note.n - minNote + 1) * noteScale;
            const height = Math.max(noteScale - 1, 1);

            const instrumentId = note.i ?? 0;
            const hue = instrumentHues[instrumentId] ?? 180;
            ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;
            ctx.fillRect(x, y, width, height);
        }
    }

    loadFromGallery(item) {
        this.cancel();
        this.stopAll();
        this.player.clear();
        this.pianoRoll.clear();
        this.parser.reset();

        // Reset state
        this.hasCompletedComposition = false;
        this.isRefineMode = false;
        this.refineBtn.disabled = true;
        this.refineBtn.classList.remove('active');
        this.input.placeholder = 'Describe your music...';

        // Clear server session
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'clear_session' }));
        }

        // Load notes
        for (const note of item.midiData) {
            this.pianoRoll.addNote(note);
            this.player.scheduleNote(note);
        }

        // Set tempo
        this.tempoSlider.value = item.tempo || 120;
        this.updateTempo();

        // Show prompt
        this.input.value = item.prompt;
        this.clearBtn.classList.remove('hidden');

        // Highlight
        this.galleryScroll.querySelectorAll('.gallery-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === item.id);
        });

        // Fit view to notes
        this.pianoRoll.fitToNotes();
        this.updatePlayPauseButton();
        this.updateTimeDisplay(0, item.duration);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    new ComposerApp();
});
