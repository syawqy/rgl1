/**
 * audio.ts — procedural sound effects.
 *
 * The game ships no binary audio assets: every sound is synthesised with
 * the Web Audio API, so the whole game stays a single JS bundle.
 *
 * All the cues are short and quiet enough not to be annoying on a phone,
 * and the whole module degrades gracefully if audio is unavailable.
 */

export type SoundCue =
  | "step"
  | "hit"
  | "miss"
  | "hurt"
  | "kill"
  | "pickup"
  | "descend"
  | "door"
  | "menu";

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  /** Lazily create the audio context — browsers require a user gesture. */
  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      this.enabled = false;
      return null;
    }
  }

  /** Call from a user gesture so the first sound is not swallowed. */
  unlock(): void {
    this.ensure();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.28 : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** A single tone with an exponential decay. */
  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = "square",
    gain = 0.5,
    slideTo?: number
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideTo),
        ctx.currentTime + duration
      );
    }

    env.gain.setValueAtTime(0.0001, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(env);
    env.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  /** A short burst of filtered noise, for impacts and footsteps. */
  private noise(duration: number, gain = 0.35, cutoff = 1200): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start();
  }

  play(cue: SoundCue): void {
    switch (cue) {
      case "step":
        this.noise(0.07, 0.16, 900);
        break;
      case "hit":
        this.noise(0.11, 0.4, 2400);
        this.tone(180, 0.1, "square", 0.25, 90);
        break;
      case "miss":
        this.tone(420, 0.09, "triangle", 0.16, 700);
        break;
      case "hurt":
        this.tone(160, 0.22, "sawtooth", 0.35, 60);
        this.noise(0.12, 0.3, 700);
        break;
      case "kill":
        this.noise(0.2, 0.4, 1800);
        this.tone(300, 0.24, "square", 0.28, 80);
        break;
      case "pickup":
        this.tone(660, 0.09, "sine", 0.24);
        setTimeout(() => this.tone(990, 0.1, "sine", 0.22), 70);
        break;
      case "descend":
        this.tone(520, 0.16, "sine", 0.24, 200);
        break;
      case "door":
        this.noise(0.16, 0.28, 600);
        break;
      case "menu":
        this.tone(440, 0.07, "square", 0.18);
        break;
    }
  }
}
