export class RadioNoise {
    private ctx: AudioContext;
    private buffer: AudioBuffer | null = null;
    private source: AudioBufferSourceNode | null = null;
    private gainNode: GainNode;
    private filterNode: BiquadFilterNode;

    constructor() {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.gainNode = this.ctx.createGain();
        this.filterNode = this.ctx.createBiquadFilter();
        
        // Bandpass filter to simulate radio limitations
        this.filterNode.type = 'bandpass';
        this.filterNode.frequency.value = 1000;
        this.filterNode.Q.value = 1.0;

        this.gainNode.connect(this.filterNode);
        this.filterNode.connect(this.ctx.destination);
    }

    private createNoiseBuffer() {
        if (this.buffer) return;
        // Make sure sampleRate is valid. Default to 44100 if context is not ready?
        const rate = this.ctx.sampleRate || 44100;
        const bufferSize = rate * 2; 
        this.buffer = this.ctx.createBuffer(1, bufferSize, rate);
        const data = this.buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // White noise
            data[i] = Math.random() * 2 - 1;
        }
    }

    async start() {
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
            } catch (e) {
                console.warn("AudioContext resume failed", e);
            }
        }
        
        // If still suspended or closed, we can't play
        if (this.ctx.state !== 'running') return;

        this.createNoiseBuffer();
        if (!this.buffer) return;

        try {
            this.source = this.ctx.createBufferSource();
            this.source.buffer = this.buffer;
            this.source.loop = true;
            
            this.source.connect(this.gainNode);
            
            // Low volume for background static
            this.gainNode.gain.setValueAtTime(0.05, this.ctx.currentTime);
            
            this.source.start();
        } catch (e) {
            console.error("RadioNoise start error", e);
        }
    }

    stop() {
        if (this.source) {
            this.source.stop();
            this.source.disconnect();
            this.source = null;
        }
    }

    // Optional: play a short "squelch" sound at start/end
    playSquelch() {
        if (this.ctx.state !== 'running') return;

        this.createNoiseBuffer();
        if (!this.buffer) return;

        try {
            const src = this.ctx.createBufferSource();
            src.buffer = this.buffer;
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

            src.connect(gain);
            gain.connect(this.ctx.destination);
            
            src.start();
            src.stop(this.ctx.currentTime + 0.15);
        } catch (e) {
            console.error("Squelch error", e);
        }
    }
}
