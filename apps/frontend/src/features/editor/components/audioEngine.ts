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
