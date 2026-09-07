import type { InstrumentId } from './types';

// Karplus-Strong string synthesis for authentic guitar sound
export const createGuitarBuffer = (audioCtx: AudioContext, frequency: number, duration: number): AudioBuffer => {
  const sampleRate = audioCtx.sampleRate;
  // A stranded note yields an undefined open pitch and therefore a NaN
  // frequency; createBuffer would throw on a NaN frame count, so fall back to
  // one frame of silence.
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  const period = Math.round(sampleRate / frequency);
  if (period <= 0) return buffer;

  const delayLine = new Float32Array(period);
  for (let i = 0; i < period; i++) {
    delayLine[i] = Math.random() * 2 - 1;
  }

  const decay = 0.995;
  let pointer = 0;

  for (let i = 0; i < bufferSize; i++) {
    const currentVal = delayLine[pointer];
    const nextPointer = (pointer + 1) % period;
    const nextVal = delayLine[nextPointer];

    const filteredVal = (currentVal + nextVal) * 0.5 * decay;

    data[i] = filteredVal;
    delayLine[pointer] = filteredVal;
    pointer = nextPointer;
  }

  const fadeLength = Math.round(sampleRate * 0.04);
  for (let i = 0; i < fadeLength; i++) {
    const idx = bufferSize - 1 - i;
    if (idx >= 0) {
      data[idx] *= (i / fadeLength);
    }
  }

  return buffer;
};

// --- VOICE REGISTRY ---
//
// One builder per instrument. Every builder receives the context it must
// schedule against and the node it must connect to — like createGuitarBuffer,
// none of them ever owns an AudioContext.

export interface VoiceRequest {
  ctx: AudioContext;
  frequency: number;
  time: number;
  duration: number;
  destination: AudioNode;
}

export type VoiceBuilder = (req: VoiceRequest) => void;

export interface VoiceEnvelope {
  attack: number;   // seconds to peak
  peak: number;     // gain at the top of the attack
  release: number;  // fraction of duration the tail decays over, 0..1
  /** Extra detuned copies, in cents; one oscillator is spawned per entry. */
  detune?: number[];
  /** Optional filter applied to the whole voice. */
  filter?: { type: BiquadFilterType; frequency: number; Q?: number };
  /** Adds a sine partial at this multiple of the fundamental. */
  partials?: { ratio: number; gain: number }[];
}

const plucked = (req: VoiceRequest): void => {
  const { ctx, frequency, time, duration, destination } = req;
  const source = ctx.createBufferSource();
  source.buffer = createGuitarBuffer(ctx, frequency, duration + 0.5); // sustain window
  source.connect(destination);
  source.start(time);
};

export const createOscVoice = (type: OscillatorType, env: VoiceEnvelope): VoiceBuilder =>
  (req: VoiceRequest): void => {
    const { ctx, frequency, time, duration, destination } = req;
    if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(duration) || duration <= 0) return;

    const voiceGain = ctx.createGain();
    let sink: AudioNode = voiceGain;

    if (env.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = env.filter.type;
      filter.frequency.setValueAtTime(env.filter.frequency, time);
      if (env.filter.Q !== undefined) filter.Q.setValueAtTime(env.filter.Q, time);
      voiceGain.connect(filter);
      filter.connect(destination);
      sink = voiceGain;
    } else {
      voiceGain.connect(destination);
    }

    // Attack to peak, then an exponential tail that never reaches zero
    // (exponentialRamp cannot target 0).
    const attack = Math.min(env.attack, duration * 0.5);
    voiceGain.gain.setValueAtTime(0, time);
    voiceGain.gain.linearRampToValueAtTime(env.peak, time + attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(duration * env.release, attack + 0.02));

    const spawn = (freq: number, detune: number, gain: number): void => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      if (detune !== 0) osc.detune.setValueAtTime(detune, time);
      if (gain === 1) {
        osc.connect(sink);
      } else {
        const partialGain = ctx.createGain();
        partialGain.gain.setValueAtTime(gain, time);
        osc.connect(partialGain);
        partialGain.connect(sink);
      }
      osc.start(time);
      osc.stop(time + duration + 0.1);
    };

    for (const detune of env.detune ?? [0]) spawn(frequency, detune, 1);
    for (const partial of env.partials ?? []) spawn(frequency * partial.ratio, 0, partial.gain);
  };

export const INSTRUMENTS: Record<InstrumentId, { label: string; build: VoiceBuilder }> = {
  guitar: { label: 'Guitar', build: plucked },
  bass: {
    label: 'Bass',
    build: createOscVoice('sawtooth', {
      attack: 0.01, peak: 0.32, release: 0.9,
      filter: { type: 'lowpass', frequency: 500, Q: 6 },
    }),
  },
  piano: {
    label: 'Piano',
    build: createOscVoice('triangle', {
      attack: 0.005, peak: 0.3, release: 0.55,
      partials: [{ ratio: 2, gain: 0.18 }, { ratio: 3, gain: 0.07 }],
    }),
  },
  trumpet: {
    label: 'Trumpet',
    build: createOscVoice('sawtooth', {
      attack: 0.06, peak: 0.22, release: 0.95,
      filter: { type: 'bandpass', frequency: 1200, Q: 1.4 },
    }),
  },
  strings: {
    label: 'Strings',
    build: createOscVoice('sawtooth', {
      attack: 0.14, peak: 0.16, release: 0.98,
      detune: [-7, 0, 7],
      filter: { type: 'lowpass', frequency: 2600 },
    }),
  },
  organ: {
    label: 'Organ',
    build: createOscVoice('sine', {
      attack: 0.02, peak: 0.2, release: 0.98,
      partials: [{ ratio: 2, gain: 0.5 }, { ratio: 3, gain: 0.25 }, { ratio: 4, gain: 0.12 }],
    }),
  },
  sine: { label: 'Sine Wave', build: createOscVoice('sine', { attack: 0.01, peak: 0.2, release: 1 }) },
  triangle: { label: 'Triangle Wave', build: createOscVoice('triangle', { attack: 0.01, peak: 0.2, release: 1 }) },
  square: { label: 'Square Wave', build: createOscVoice('square', { attack: 0.01, peak: 0.2, release: 1 }) },
  sawtooth: { label: 'Saw Wave', build: createOscVoice('sawtooth', { attack: 0.01, peak: 0.2, release: 1 }) },
};

/** Unknown ids fall back rather than throwing on `osc.type = <garbage>`. */
export const getVoice = (id: string): VoiceBuilder =>
  (INSTRUMENTS[id as InstrumentId] ?? INSTRUMENTS.sine).build;
