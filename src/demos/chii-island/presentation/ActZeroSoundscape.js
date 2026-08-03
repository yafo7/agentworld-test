export class ActZeroSoundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.rotor = null;
    this.rotorGain = null;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
      this._startRotor();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return true;
  }

  _startRotor() {
    if (!this.context || this.rotor) return;
    this.rotor = this.context.createOscillator();
    this.rotor.type = 'sawtooth';
    this.rotor.frequency.value = 36;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;
    this.rotorGain = this.context.createGain();
    this.rotorGain.gain.value = 0.08;
    this.rotor.connect(filter);
    filter.connect(this.rotorGain);
    this.rotorGain.connect(this.master);
    this.rotor.start();
  }

  setRotorUrgency(value) {
    if (!this.context || !this.rotor || !this.rotorGain) return;
    const urgency = Math.max(0, Math.min(1, Number(value) || 0));
    const now = this.context.currentTime;
    this.rotor.frequency.setTargetAtTime(36 + urgency * 18, now, 0.08);
    this.rotorGain.gain.setTargetAtTime(0.08 + urgency * 0.08, now, 0.08);
  }

  playWhoosh(duration = 2.2) {
    this._playNoise({
      duration,
      volume: 0.42,
      filterType: 'bandpass',
      frequency: 820,
      sweepTo: 1700,
    });
  }

  playSplash() {
    this._playNoise({
      duration: 1.15,
      volume: 0.58,
      filterType: 'lowpass',
      frequency: 620,
      sweepTo: 110,
    });
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(42, this.context.currentTime + 0.45);
    gain.gain.setValueAtTime(0.28, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.65);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.7);
  }

  _playNoise({
    duration,
    volume,
    filterType,
    frequency,
    sweepTo,
  }) {
    if (!this.context || !this.master) return;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const envelope = 1 - index / data.length;
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, this.context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(20, sweepTo),
      this.context.currentTime + duration,
    );
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  dispose() {
    try {
      this.rotor?.stop();
    } catch {}
    this.rotor = null;
    this.rotorGain = null;
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }
    this.master = null;
  }
}
