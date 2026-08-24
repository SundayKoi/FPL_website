// Pack-opening sound effects, synthesized on the fly.
//
// There are no audio files here and there deliberately never will be: every
// noise the pack counter makes is a handful of oscillators and a buffer of
// white noise, built at the moment it plays. That keeps the payload at zero
// bytes and lets the sting scale with the pull — a legendary literally gets
// more notes than a common rather than a different mp3.
//
// Everything in this module is best-effort. Browsers refuse to start an
// AudioContext outside a user gesture, some block it entirely, and jsdom has
// no WebAudio at all — so every entry point is guarded and swallows its own
// failures. Opening a pack must never break because the speakers didn't.

import type { RarityClass } from "@/lib/packs/config";

/** Master level for everything here. Pack opening is a background flourish,
 *  not a jump scare — loud enough to notice on laptop speakers, quiet enough
 *  that nobody reaches for the volume key. */
const MASTER_GAIN = 0.2;

/** How much rip progress has to pass before another crackle plays. The tear
 *  is a continuous drag, so without a floor this fires once per pointermove
 *  and turns into static. */
const TICK_STEP = 0.08;

/** The rising notes each rarity's payoff sting plays, in Hz. Common gets a
 *  two-note shrug; legendary gets a full run up the scale. */
const STING_NOTES: Record<RarityClass, number[]> = {
  common: [523.25, 659.25],
  rare: [523.25, 659.25, 783.99],
  epic: [523.25, 659.25, 783.99, 1046.5],
  legendary: [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.51],
};

/** Where the sound toggle is remembered. Packs get opened in the office. */
const MUTE_KEY = "fpl.packs.muted";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
/** Set once construction fails, so a browser that refuses WebAudio isn't
 *  asked again on every single tick of every subsequent rip. */
let ctxFailed = false;
/** null until first read; see getMuted. */
let muted: boolean | null = null;
const muteListeners = new Set<() => void>();
/** Progress at which the last rip crackle played; see TICK_STEP. */
let lastTickAt = -1;

/** Promises from suspend()/resume() reject on their own schedule (and are
 *  undefined under a stub); neither should reach the console. */
function settle(result: unknown): void {
  if (result && typeof (result as Promise<void>).catch === "function") {
    (result as Promise<void>).catch(() => {});
  }
}

/** The shared AudioContext, created on first use — which, because every entry
 *  point here is called from a click or a drag, is always inside a gesture. */
function audio(): AudioContext | null {
  if (ctxFailed || typeof window === "undefined" || getMuted()) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) {
        ctxFailed = true;
        return null;
      }
      ctx = new Ctor();
    } catch {
      ctxFailed = true;
      return null;
    }
  }
  // Autoplay policies park a context in "suspended" until a gesture resumes
  // it; a context created before the first click stays there otherwise.
  try {
    if (ctx.state === "suspended") settle(ctx.resume?.());
  } catch {
    /* nothing to do — the nodes below simply won't be heard */
  }
  return ctx;
}

/** An attack/decay envelope. Exponential ramps can't touch zero, hence the
 *  0.0001 floor at both ends. */
function envelope(c: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return gain;
}

/** One plucked note. */
function note(
  c: AudioContext,
  freq: number,
  at: number,
  dur: number,
  peak: number,
  type: OscillatorType = "triangle",
): void {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  const gain = envelope(c, at, peak, 0.012, dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.08);
}

/** A buffer of white noise, `dur` seconds long. The raw material for both the
 *  rip crackle and the shimmer tails. */
function noise(c: AudioContext, dur: number): AudioBufferSourceNode {
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  return source;
}

/** Airy noise sweeping upward through a highpass — the "sparkle" you hear
 *  over a good pull, as opposed to the notes underneath it. */
function shimmer(c: AudioContext, at: number, dur: number, peak: number): void {
  const source = noise(c, dur);
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(2600, at);
  filter.frequency.linearRampToValueAtTime(7000, at + dur);
  const gain = envelope(c, at, peak, 0.06, dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  source.start(at);
  source.stop(at + dur + 0.05);
}

/**
 * Mute is one process-wide, persisted setting rather than component state:
 * the reveal blips fire from PackShop and the rip noises from inside PackRip,
 * and a preference about the speakers should outlive both (and the tab).
 *
 * Exposed as a subscribe/snapshot pair so React can read it with
 * useSyncExternalStore — which is what it actually is, an external store —
 * instead of seeding state from localStorage and desyncing the server render.
 */
export function getMuted(): boolean {
  if (muted === null) {
    muted = false;
    if (typeof window !== "undefined") {
      try {
        muted = window.localStorage.getItem(MUTE_KEY) === "1";
      } catch {
        /* private mode / blocked storage — sound stays on */
      }
    }
  }
  return muted;
}

/** Server render has no preference to read, so it always sounds unmuted. */
export function getMutedServer(): boolean {
  return false;
}

export function subscribeMuted(listener: () => void): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function setMuted(next: boolean): void {
  if (getMuted() === next) return;
  muted = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      /* the toggle still works for this session */
    }
  }
  if (next && ctx) {
    try {
      settle(ctx.suspend?.());
    } catch {
      /* already gone */
    }
  }
  muteListeners.forEach((listener) => listener());
}

/**
 * A short crackle as the tear advances. Called on every pointer move during
 * the rip and throttled here (not by the caller) so the throttle can't be
 * forgotten — progress running backwards, i.e. a fresh pack, resets it.
 */
export function ripTick(progress: number): void {
  if (getMuted()) return;
  if (progress < lastTickAt) lastTickAt = -1;
  if (progress < lastTickAt + TICK_STEP) return;
  lastTickAt = progress;

  const c = audio();
  if (!c) return;
  try {
    const at = c.currentTime;
    const source = noise(c, 0.08);
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    // Brighter as the tear widens — the foil gets thinner and higher-pitched
    // the further across you drag.
    filter.frequency.setValueAtTime(1100 + progress * 2400, at);
    filter.Q.setValueAtTime(1.4, at);
    const gain = envelope(c, at, MASTER_GAIN * 0.55, 0.004, 0.06);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start(at);
    source.stop(at + 0.1);
  } catch {
    /* a silent rip is still a rip */
  }
}

/**
 * The payoff sting, fired the instant the pack bursts. Scaled to what's
 * inside: more notes and more tail the better the pull, a low boom under a
 * legendary, and a high chime on top if anything in there is autographed.
 * Everything lands inside ~1.4s so it doesn't run over the card reveal.
 */
export function ripOpen(rarity: RarityClass, signed: boolean): void {
  if (getMuted()) return;
  const c = audio();
  if (!c) return;
  try {
    const at = c.currentTime;
    const notes = STING_NOTES[rarity] ?? STING_NOTES.common;
    const step = rarity === "legendary" ? 0.075 : 0.09;
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1;
      note(c, freq, at + i * step, last ? 0.38 : 0.2, MASTER_GAIN * (last ? 1 : 0.75));
    });

    const stingEnd = at + notes.length * step;
    if (rarity === "epic") shimmer(c, stingEnd, 0.5, MASTER_GAIN * 0.3);
    if (rarity === "legendary") {
      shimmer(c, stingEnd, 0.85, MASTER_GAIN * 0.4);
      // The boom sits under the arpeggio rather than after it — the weight
      // arrives with the burst, not once it's finished.
      const boom = c.createOscillator();
      boom.type = "sine";
      boom.frequency.setValueAtTime(72, at);
      boom.frequency.exponentialRampToValueAtTime(34, at + 0.9);
      const boomGain = envelope(c, at, MASTER_GAIN * 1.5, 0.03, 0.86);
      boom.connect(boomGain);
      boomGain.connect(c.destination);
      boom.start(at);
      boom.stop(at + 1.0);
    }

    if (signed) {
      // Two bell tones an octave-ish apart, above everything else — the pen
      // stroke you hear over the top of the pull.
      note(c, 2637.02, stingEnd + 0.04, 0.5, MASTER_GAIN * 0.35, "sine");
      note(c, 3520.0, stingEnd + 0.14, 0.42, MASTER_GAIN * 0.25, "sine");
    }
  } catch {
    /* see ripTick */
  }
}

/** A blip as one card lands during the staggered reveal, pitched by rarity
 *  rank so the run audibly climbs toward the chase card. */
export function revealTone(rank: number): void {
  if (getMuted()) return;
  const c = audio();
  if (!c) return;
  try {
    const at = c.currentTime;
    // A minor third per rarity class: common 392Hz up to legendary ~659Hz.
    const freq = 392 * Math.pow(2, Math.max(0, rank) / 4);
    note(c, freq, at, 0.16, MASTER_GAIN * 0.45);
  } catch {
    /* see ripTick */
  }
}
