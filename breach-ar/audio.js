/** Small, local-only synthesizer. No sound files or network calls. */
export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.nodes = new Set();
    this.noise = null;
  }

  async unlock() {
    try {
      if (!this.context) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.22;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 24;
        compressor.ratio.value = 7;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.16;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context) {
      const t = this.context.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.22, t, 0.025);
    }
    return this.muted;
  }

  _tone(frequency, endFrequency, duration, gain, type = 'sine', delay = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(envelope);
    envelope.connect(this.master);
    this.nodes.add(osc);
    osc.onended = () => { this.nodes.delete(osc); osc.disconnect(); envelope.disconnect(); };
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  _noise(duration, gain, high = 2400, low = 130, delay = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.muted) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(high, t);
    filter.frequency.exponentialRampToValueAtTime(low, t + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    this.nodes.add(source);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(t, Math.random() * Math.max(0, 1 - duration));
    source.stop(t + duration + 0.02);
  }

  shot() {
    this._tone(1450, 190, 0.11, 0.22, 'triangle');
    this._tone(220, 70, 0.065, 0.12, 'sine');
  }

  hit() {
    this._tone(1750, 650, 0.08, 0.14, 'triangle');
    this._noise(0.055, 0.12, 5000, 1200);
  }

  explosion() {
    this._noise(0.5, 0.72, 3200, 90);
    this._tone(150, 34, 0.34, 0.55, 'sine');
    this._tone(710, 95, 0.12, 0.08, 'triangle');
  }

  damage() {
    this._tone(125, 55, 0.36, 0.35, 'sawtooth');
    this._noise(0.27, 0.38, 1300, 90);
  }

  wave() {
    [330, 440, 660].forEach((frequency, i) => this._tone(frequency, frequency * 1.002, 0.21, 0.18, 'sine', i * 0.11));
  }

  pulse() {
    this._tone(120, 900, 0.24, 0.28, 'sine');
    this._tone(70, 28, 0.8, 0.7, 'sine', 0.09);
    this._noise(0.72, 0.55, 4300, 80, 0.12);
  }

  focus() {
    this._tone(720, 1080, 0.13, 0.1, 'sine');
    this._tone(1440, 1440, 0.1, 0.06, 'sine', 0.08);
  }

  critical() {
    this._tone(2300, 420, 0.16, 0.2, 'triangle');
    this._tone(180, 45, 0.2, 0.34, 'sine');
    this._noise(0.12, 0.24, 4200, 800);
  }

  warning() {
    this._tone(480, 480, 0.095, 0.12, 'sine');
    this._tone(480, 480, 0.095, 0.1, 'sine', 0.18);
  }

  upgrade() {
    [440, 554, 660, 880].forEach((frequency, index) => this._tone(frequency, frequency, 0.25, 0.14, 'sine', index * 0.065));
  }

  boss() {
    this._tone(72, 48, 0.75, 0.38, 'sine');
    this._tone(144, 96, 0.6, 0.14, 'triangle');
    this._noise(0.5, 0.2, 1200, 110);
  }

  stop() {
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* An already ended voice needs no work. */ }
    }
    this.nodes.clear();
  }
}
