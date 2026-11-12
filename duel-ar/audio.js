/* PULSE DUEL — procedural Web Audio. No audio files, media capture or network. */
export class DuelAudio {
  constructor({ muted = false } = {}) {
    this.muted = !!muted;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.voices = new Set();
    this.lastShot = 0;
    this.unlocked = false;
  }

  async unlock() {
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      if (!this.context || this.context.state === 'closed') {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : .22;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 6;
        limiter.attack.value = .002; limiter.release.value = .12;
        this.master.connect(limiter); limiter.connect(this.context.destination);
        this.limiter = limiter;
        this.noiseBuffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * .5), this.context.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < samples.length; i++) {
          last = (last + Math.random() * 2 - 1) * .65;
          samples[i] = last;
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      // A silent buffer also unlocks older mobile Safari audio output.
      const source = this.context.createBufferSource();
      source.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      source.connect(this.master); source.start();
      source.onended = () => source.disconnect();
      this.unlocked = this.context.state === 'running';
      return this.unlocked;
    } catch { return false; }
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master && this.context?.state !== 'closed') {
      this.master.gain.setTargetAtTime(this.muted ? 0 : .22, this.context.currentTime, .025);
    }
  }

  tone(frequency, endFrequency, duration, { type = 'sine', gain = .45, delay = 0, attack = .005 } = {}) {
    if (!this.context || !this.master || this.voices.size >= 32) return;
    const c = this.context, at = c.currentTime + delay;
    const oscillator = c.createOscillator(), envelope = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), at + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(this.master);
    oscillator.start(at); oscillator.stop(at + duration + .025);
    this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
  }

  noise(duration, { filter = 1800, gain = .25, delay = 0, type = 'bandpass' } = {}) {
    if (!this.context || !this.noiseBuffer || this.voices.size >= 32) return;
    const c = this.context, at = c.currentTime + delay;
    const source = c.createBufferSource(), envelope = c.createGain(), eq = c.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    eq.type = type; eq.frequency.value = filter; eq.Q.value = .7;
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(gain, .0002), at + .004);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(eq); eq.connect(envelope); envelope.connect(this.master);
    source.start(at); source.stop(at + Math.min(duration + .025, .5));
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); eq.disconnect(); envelope.disconnect(); };
  }

  play(name, { value = 1 } = {}) {
    if (this.muted || !this.unlocked || this.context?.state !== 'running') return;
    switch (name) {
      case 'ui':
        this.tone(740, 900, .055, { gain: .16 });
        break;
      case 'countdown':
        this.tone(value === 1 ? 520 : 420, value === 1 ? 520 : 420, .12, { type: 'triangle', gain: .4 });
        this.tone(1040, 1040, .05, { gain: .09 });
        break;
      case 'start':
        this.tone(460, 920, .17, { type: 'triangle', gain: .45 });
        this.tone(920, 1380, .23, { gain: .23, delay: .05 });
        this.noise(.1, { gain: .12, filter: 3500 });
        break;
      case 'shot': {
        const now = performance.now();
        if (now - this.lastShot < 75) return;
        this.lastShot = now;
        this.tone(1650, 140, .19, { type: 'sawtooth', gain: .14 });
        this.tone(210, 58, .22, { type: 'sine', gain: .55 });
        this.noise(.09, { gain: .2, filter: 2500 });
        break;
      }
      case 'hit':
        this.tone(1280, 640, .1, { type: 'triangle', gain: .33 });
        this.tone(1900, 950, .08, { gain: .18, delay: .025 });
        this.noise(.1, { gain: .14, filter: 4500 });
        break;
      case 'damage':
        this.tone(155, 40, .28, { type: 'triangle', gain: .55 });
        this.noise(.23, { gain: .4, filter: 500, type: 'lowpass' });
        break;
      case 'reload':
        this.noise(.05, { gain: .22, filter: 4000 });
        this.tone(320, 900, .14, { type: 'triangle', gain: .2, delay: .1 });
        break;
      case 'win':
        [392, 523.25, 659.25, 783.99].forEach((f, i) => {
          this.tone(f, f, i === 3 ? .65 : .3, { type: 'triangle', gain: .32, delay: i * .105 });
          this.tone(f * 2, f * 2, .32, { gain: .08, delay: i * .105 });
        });
        this.noise(.2, { gain: .08, filter: 6000, delay: .32 });
        break;
      case 'lose':
        [349.23, 293.66, 220].forEach((f, i) => this.tone(f, f * .98, .35, { type: 'triangle', gain: .28, delay: i * .14 }));
        break;
      case 'draw':
        this.tone(440, 440, .27, { type: 'triangle', gain: .3 });
        this.tone(660, 660, .35, { type: 'triangle', gain: .2, delay: .14 });
        break;
    }
  }

  async close() {
    for (const voice of this.voices) { try { voice.stop(); } catch { /* already ended */ } }
    this.voices.clear();
    this.unlocked = false;
    if (this.context && this.context.state !== 'closed') await this.context.close().catch(() => {});
    this.context = this.master = this.noiseBuffer = null;
  }
}
