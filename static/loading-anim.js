// Musical loading animation with animated notes

class MusicLoader {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.animationId = null;
        this.startTime = null;

        this.resize();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.width = rect.width * dpr;
        this.height = rect.height * dpr;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.ctx.scale(dpr, dpr);

        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }

    start() {
        this.startTime = performance.now();
        this.canvas.style.display = 'block';
        this.animate();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.canvas.style.display = 'none';
        this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    animate() {
        const t = (performance.now() - this.startTime) / 1000;
        this.render(t);
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    render(t) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

        const centerX = this.displayWidth / 2;
        const centerY = this.displayHeight / 2;

        // Animated music notes floating up
        const noteCount = 6;
        for (let i = 0; i < noteCount; i++) {
            const phase = (t * 0.8 + i * 0.4) % 2.5;
            const xOffset = Math.sin(t * 2 + i * 1.2) * 40;
            const x = centerX + xOffset;
            const y = centerY + 60 - phase * 80;
            const opacity = Math.max(0, 1 - phase / 2);
            const scale = 0.8 + Math.sin(t * 3 + i) * 0.2;

            this.drawNote(x, y, opacity, scale, i);
        }

        // Pulsing circle
        const radius = 25 + Math.sin(t * 4) * 5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(52, 152, 219, 0.4)`; // Selection blue
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner pulse
        const innerRadius = 15 + Math.sin(t * 4 + Math.PI) * 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 152, 219, 0.2)`;
        ctx.fill();

        // Sound wave rings
        for (let i = 0; i < 3; i++) {
            const wavePhase = (t * 0.5 + i * 0.3) % 1;
            const waveRadius = 30 + wavePhase * 50;
            const waveOpacity = (1 - wavePhase) * 0.3;

            ctx.beginPath();
            ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(224, 224, 224, ${waveOpacity})`; // text-primary
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    drawNote(x, y, opacity, scale, index) {
        const ctx = this.ctx;

        // Different note symbols
        const noteTypes = ['quarter', 'eighth', 'beam', 'quarter', 'eighth', 'beam'];
        const type = noteTypes[index % noteTypes.length];

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b5de5'];
        ctx.fillStyle = `rgba(${this.hexToRgb(colors[index % colors.length])}, ${opacity})`;
        ctx.strokeStyle = `rgba(${this.hexToRgb(colors[index % colors.length])}, ${opacity})`;

        if (type === 'quarter') {
            // Note head
            ctx.beginPath();
            ctx.ellipse(0, 0, 8, 6, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // Stem
            ctx.fillRect(6, -25, 2, 25);
        } else if (type === 'eighth') {
            // Note head
            ctx.beginPath();
            ctx.ellipse(0, 0, 8, 6, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // Stem
            ctx.fillRect(6, -25, 2, 25);
            // Flag
            ctx.beginPath();
            ctx.moveTo(8, -25);
            ctx.quadraticCurveTo(18, -20, 12, -10);
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Beamed notes
            ctx.beginPath();
            ctx.ellipse(-8, 0, 6, 5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(8, 0, 6, 5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // Stems
            ctx.fillRect(-2, -20, 2, 20);
            ctx.fillRect(14, -20, 2, 20);
            // Beam
            ctx.fillRect(-2, -22, 18, 3);
        }

        ctx.restore();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
        }
        return '255, 255, 255';
    }
}
