import type { Duration, TabBeat, TabMeasure, TabNote, TabSong, TimeSignature } from './types';
import { DURATIONS, allStringPitches, createId } from './songUtils';

export type ParseSongResult =
  | { ok: true; song: TabSong }
  | { ok: false; error: string };

const MIN_BPM = 20;
const MAX_BPM = 400;
const MAX_FRET = 24;
const VALID_DENOMINATORS = [1, 2, 4, 8, 16];

// Technique flags are copied only when explicitly true, so a stored `false`
// or a stray non-boolean never survives into the model.
const TECHNIQUE_KEYS = [
  'harmonic',
  'palmMute',
  'letRing',
  'vibrato',
  'ghostNote',
  'slur',
  'legatoSlide',
  'bend',
] as const;

// Canonical object guard for this validation boundary: it proves an object, so
// every field below is still checked with typeof / Array.isArray.
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDuration = (value: unknown): value is Duration =>
  typeof value === 'string' && (DURATIONS as readonly string[]).includes(value);

const isValidBpm = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM;

const parseTimeSignature = (value: unknown): TimeSignature | null => {
  if (!isRecord(value)) return null;
  const { numerator, denominator } = value;
  if (typeof numerator !== 'number' || !Number.isInteger(numerator) || numerator < 1 || numerator > 32) return null;
  if (typeof denominator !== 'number' || !VALID_DENOMINATORS.includes(denominator)) return null;
  return { numerator, denominator };
};

const parseId = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 ? value : createId();

const parseNote = (value: unknown, where: string): TabNote | string => {
  if (!isRecord(value)) return `${where} contains a malformed note.`;
  const { stringIndex, fret } = value;
  if (
    typeof stringIndex !== 'number' ||
    !Number.isInteger(stringIndex) ||
    stringIndex < 0 ||
    stringIndex >= allStringPitches.length
  ) {
    return `${where} has a note on an invalid string.`;
  }
  if (typeof fret !== 'number' || !Number.isInteger(fret) || fret < 0 || fret > MAX_FRET) {
    return `${where} has an invalid fret.`;
  }

  const note: TabNote = { stringIndex, fret };
  for (const key of TECHNIQUE_KEYS) {
    if (value[key] === true) note[key] = true;
  }
  return note;
};

const parseBeat = (value: unknown, where: string): TabBeat | string => {
  if (!isRecord(value)) return `${where} is malformed.`;
  const duration = value.duration;
  if (!isDuration(duration)) {
    return `${where} has an invalid duration.`;
  }

  const rawNotes = value.notes;
  if (rawNotes !== undefined && !Array.isArray(rawNotes)) return `${where} has a malformed note list.`;

  const notes: TabNote[] = [];
  for (const rawNote of rawNotes ?? []) {
    const note = parseNote(rawNote, where);
    if (typeof note === 'string') return note;
    notes.push(note);
  }

  const beat: TabBeat = {
    id: parseId(value.id),
    duration,
    notes,
  };
  if (value.dot === true) beat.dot = true;
  if (value.isRest === true) beat.isRest = true;
  return beat;
};

const parseMeasure = (value: unknown, index: number): TabMeasure | string => {
  const label = `Measure ${index + 1}`;
  if (!isRecord(value)) return `${label} is malformed.`;
  if (!Array.isArray(value.beats) || value.beats.length === 0) {
    return `${label} must contain at least one beat.`;
  }

  const beats: TabBeat[] = [];
  for (let i = 0; i < value.beats.length; i++) {
    const beat = parseBeat(value.beats[i], `${label} beat ${i + 1}`);
    if (typeof beat === 'string') return beat;
    beats.push(beat);
  }

  const measure: TabMeasure = { id: parseId(value.id), beats };
  // Invalid optional overrides are dropped rather than rejected: the song
  // still plays with the inherited value.
  if (isValidBpm(value.bpm)) measure.bpm = value.bpm;
  const timeSignature = parseTimeSignature(value.timeSignature);
  if (timeSignature) measure.timeSignature = timeSignature;
  return measure;
};

// Rebuilds the song field by field, so unknown keys never reach the model.
export const parseSong = (value: unknown): ParseSongResult => {
  if (!isRecord(value)) return { ok: false, error: 'Song must be a JSON object.' };

  const { title, artist, bpm } = value;
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, error: 'Song title is required.' };
  }
  if (!isValidBpm(bpm)) {
    return { ok: false, error: `Song bpm must be a number between ${MIN_BPM} and ${MAX_BPM}.` };
  }
  const timeSignature = parseTimeSignature(value.timeSignature);
  if (!timeSignature) return { ok: false, error: 'Song time signature is invalid.' };
  if (!Array.isArray(value.measures) || value.measures.length === 0) {
    return { ok: false, error: 'Song must contain at least one measure.' };
  }

  const measures: TabMeasure[] = [];
  for (let i = 0; i < value.measures.length; i++) {
    const measure = parseMeasure(value.measures[i], i);
    if (typeof measure === 'string') return { ok: false, error: measure };
    measures.push(measure);
  }

  return {
    ok: true,
    song: {
      title,
      artist: typeof artist === 'string' && artist.trim().length > 0 ? artist : 'Unknown Artist',
      bpm,
      timeSignature,
      measures,
    },
  };
};
