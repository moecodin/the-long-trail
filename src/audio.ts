// The game's sound. Music goes through Web Audio so it can loop with no gap,
// and the storm (rain and thunder) is made right here in code.
//
// iPhones stay silent until the player taps something, so unlock() must be
// called from inside a tap. The "Tap to begin" button does that.

export class AudioManager {
  readonly ctx: AudioContext;
  private master: GainNode;
  private musicGain: GainNode;
  private sfxGain: GainNode;
  private music: AudioBufferSourceNode | null = null;
  private musicBuffer: Promise<AudioBuffer | null> | null = null;
  private rain: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private noise: AudioBuffer;

  constructor(muted: boolean) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.noise = this.makeNoise(4);
  }

  /** Call from a tap handler. Safe to call more than once. */
  unlock(): void {
    if (this.ctx.state !== "running") void this.ctx.resume();
    // Older iOS versions also want a sound started inside the tap itself.
    const blip = this.ctx.createBufferSource();
    blip.buffer = this.ctx.createBuffer(1, 1, 22050);
    blip.connect(this.ctx.destination);
    blip.start();
  }

  setMuted(muted: boolean): void {
    this.fade(this.master.gain, muted ? 0 : 1, 0.3);
  }

  /** Start fetching and decoding the music early so it's ready by the first tap. */
  preloadMusic(url: string): void {
    this.musicBuffer ??= fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise<AudioBuffer>((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
      .catch((err) => {
        console.warn("Music could not load", err);
        return null;
      });
  }

  /**
   * Loops the music with no gap, fading in. loopEnd is the exact loop length
   * in seconds, so the tiny bit of padding .m4a files add is never heard.
   */
  async playMusic(url: string, loopEnd: number, volume = 0.8, fadeIn = 3): Promise<void> {
    this.preloadMusic(url);
    const buffer = await this.musicBuffer;
    if (!buffer || this.music) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = Math.min(loopEnd, buffer.duration);
    src.connect(this.musicGain);
    src.start();
    this.music = src;
    this.fade(this.musicGain.gain, volume, fadeIn);
  }

  setMusicVolume(volume: number, seconds = 1.5): void {
    this.fade(this.musicGain.gain, volume, seconds);
  }

  /** Soft rain made from filtered noise. */
  startRain(volume = 0.5, fadeIn = 2): void {
    if (this.rain) {
      this.fade(this.rain.gain.gain, volume, fadeIn);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2400;
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 350;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(lowpass).connect(highpass).connect(gain).connect(this.sfxGain);
    src.start();
    this.rain = { gain, src };
    this.fade(gain.gain, volume, fadeIn);
  }

  setRain(volume: number, seconds = 2): void {
    if (this.rain) this.fade(this.rain.gain.gain, volume, seconds);
  }

  /** A low rolling rumble. */
  thunder(strength = 1): void {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 3.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(1.4 * strength, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t, Math.random() * 2);
    src.stop(t + 4.6);
  }

  /** A tiny wooden click for buttons. */
  tick(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.08);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  private fade(param: AudioParam, to: number, seconds: number): void {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(to, t + Math.max(0.01, seconds));
  }

  private makeNoise(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
