// Streaming MIDI JSON parser that extracts note events from LLM output

class MidiParser {
    constructor(onNote, onWarning = null, onBank = null) {
        this.onNote = onNote;
        this.onWarning = onWarning;
        this.onBank = onBank;
        this.buffer = '';
        this.notes = [];
        this.processedPositions = new Set();
        this.bank = null;
    }

    reset() {
        this.buffer = '';
        this.notes = [];
        this.processedPositions.clear();
        this.bank = null;
    }

    feed(chunk) {
        this.buffer += chunk;
        this.extractNotes();
    }

    extractNotes() {
        // Match complete JSON objects
        const jsonRegex = /\{[^{}]*\}/g;
        let match;
        let lastIndex = 0;

        while ((match = jsonRegex.exec(this.buffer)) !== null) {
            // Skip if we've already processed this position
            if (this.processedPositions.has(match.index)) {
                continue;
            }

            try {
                const obj = JSON.parse(match[0]);
                // Bank selection (LLM first line)
                if (obj && typeof obj.bank === 'string') {
                    this.bank = obj.bank;
                    if (this.onBank) this.onBank(obj.bank);
                    this.processedPositions.add(match.index);
                    continue;
                }

                if (this.validateNote(obj)) {
                    this.notes.push(obj);
                    this.processedPositions.add(match.index);
                    this.onNote(obj);
                }
            } catch (e) {
                // Invalid JSON, might be incomplete - skip
                if (this.onWarning) {
                    this.onWarning({
                        type: 'parse_error',
                        details: e.message,
                        buffer: match[0].slice(0, 50)
                    });
                }
            }
            lastIndex = match.index + match[0].length;
        }

        // Keep only unprocessed content (from last complete match to end)
        // But be conservative to handle partial JSON
        const lastBrace = this.buffer.lastIndexOf('}');
        if (lastBrace >= 0) {
            // Find the start of any incomplete JSON after the last complete one
            const afterLastComplete = this.buffer.slice(lastBrace + 1);
            const incompleteStart = afterLastComplete.indexOf('{');
            if (incompleteStart >= 0) {
                // Keep from the incomplete JSON start
                this.buffer = afterLastComplete.slice(incompleteStart);
                this.processedPositions.clear();
            } else if (afterLastComplete.trim().length === 0) {
                // Nothing left, clear buffer
                this.buffer = '';
                this.processedPositions.clear();
            }
        }
    }

    validateNote(note) {
        // Check required fields
        if (typeof note.t !== 'number' || note.t < 0) return false;
        if (typeof note.n !== 'number' || note.n < 0 || note.n > 127) return false;
        if (typeof note.v !== 'number' || note.v < 1 || note.v > 127) return false;
        if (typeof note.d !== 'number' || note.d <= 0) return false;

        // Validate optional instrument field (default to 0 if missing/invalid)
        if (note.i !== undefined) {
            if (typeof note.i !== 'number' || note.i < 0 || note.i > 7) {
                note.i = 0;
            }
        } else {
            note.i = 0;
        }
        return true;
    }

    getNotes() {
        return [...this.notes];
    }

    getEndTime() {
        if (this.notes.length === 0) return 0;
        let maxEnd = 0;
        for (const note of this.notes) {
            const end = note.t + note.d;
            if (end > maxEnd) maxEnd = end;
        }
        return maxEnd;
    }
}
