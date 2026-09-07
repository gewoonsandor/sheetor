import type {
  Duration, InstrumentId, StaffDisplay, TabBeat, TabMeasure, TabNote, TabSong,
  TabTrack, TimeSignature, TrackKind,
} from './types';
import {
  DEFAULT_TRANSPOSE, DURATIONS, allStringPitches, createId, createTrack,
  getStringPitches, normalizeTrackLengths, requiredStringCount,
} from './songUtils';

export type ParseSongResult =
  | { ok: true; song: TabSong }
  | { ok: false; error: string };

const MIN_BPM = 20;
const MAX_BPM = 400;
const MAX_FRET = 24;
const MIN_MIDI = 0;
const MAX_MIDI = 127;
const VALID_DENOMINATORS = [1, 2, 4, 8, 16];

const INSTRUMENT_IDS: readonly InstrumentId[] = [
  'guitar', 'bass', 'piano', 'trumpet', 'strings', 'organ',
  'sine', 'triangle', 'square', 'sawtooth',
];
const STAFF_DISPLAYS: readonly StaffDisplay[] = ['notation', 'tab', 'both'];
const TRACK_KINDS: readonly TrackKind[] = ['fretted', 'pitched'];

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

  // A note is pitched when it carries an absolute midi, fretted otherwise.
  // Legacy files only ever contain the fretted shape.
  let note: TabNote;
  if (value.midi !== undefined) {
    const { midi } = value;
    if (typeof midi !== 'number' || !Number.isInteger(midi) || midi < MIN_MIDI || midi > MAX_MIDI) {
      return `${where} has an invalid pitch.`;
    }
    note = { midi };
  } else {
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
    note = { stringIndex, fret };
  }

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

const parseMeasure = (value: unknown, index: number, prefix: string = 'Measure '): TabMeasure | string => {
  const label = `${prefix}${index + 1}`;
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

const parseMeasureList = (value: unknown, label: string, prefix: string): TabMeasure[] | string => {
  if (!Array.isArray(value) || value.length === 0) {
    return `${label} must contain at least one measure.`;
  }
  const measures: TabMeasure[] = [];
  for (let i = 0; i < value.length; i++) {
    const measure = parseMeasure(value[i], i, prefix);
    if (typeof measure === 'string') return measure;
    measures.push(measure);
  }
  return measures;
};

/**
 * Structural fields reject; every optional track field is repaired to a sane
 * default rather than failing the whole load.
 */
const parseTrack = (value: unknown, index: number): TabTrack | string => {
  const label = `Track ${index + 1}`;
  if (!isRecord(value)) return `${label} is malformed.`;

  const measures = parseMeasureList(value.measures, label, `${label} measure `);
  if (typeof measures === 'string') return measures;

  const instrument = INSTRUMENT_IDS.includes(value.instrument as InstrumentId)
    ? (value.instrument as InstrumentId)
    : 'guitar';
  const kind = TRACK_KINDS.includes(value.kind as TrackKind)
    ? (value.kind as TrackKind)
    : 'fretted';
  const display = STAFF_DISPLAYS.includes(value.display as StaffDisplay)
    ? (value.display as StaffDisplay)
    : (kind === 'fretted' ? 'both' : 'notation');

  const track: TabTrack = {
    id: parseId(value.id),
    name: typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name
      : createTrack(kind, instrument).name,
    kind,
    // A pitched staff has no TAB to draw, whatever the file claims.
    display: kind === 'pitched' ? 'notation' : display,
    instrument,
    transpose: typeof value.transpose === 'number' && Number.isFinite(value.transpose)
      ? value.transpose
      : DEFAULT_TRANSPOSE[instrument],
    volume: typeof value.volume === 'number' && value.volume >= 0 && value.volume <= 1
      ? value.volume
      : 1,
    measures,
  };

  if (kind === 'fretted') {
    const raw = value.tuning;
    const valid = Array.isArray(raw)
      && raw.length > 0
      && raw.every(p => typeof p === 'number' && Number.isFinite(p));
    // Tuning must still cover every note the track actually contains.
    track.tuning = valid
      ? (raw as number[])
      : getStringPitches(requiredStringCount(measures, 6));
  }
  if (value.muted === true) track.muted = true;
  if (value.soloed === true) track.soloed = true;

  return track;
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

  let tracks: TabTrack[];
  if (Array.isArray(value.tracks)) {
    // v2: an explicit track list.
    if (value.tracks.length === 0) return { ok: false, error: 'Song must contain at least one track.' };
    tracks = [];
    for (let i = 0; i < value.tracks.length; i++) {
      const track = parseTrack(value.tracks[i], i);
      if (typeof track === 'string') return { ok: false, error: track };
      tracks.push(track);
    }
  } else {
    // v1: a single flat measure list, promoted to one guitar track. The error
    // strings on this path are unchanged so old files fail exactly as before.
    const measures = parseMeasureList(value.measures, 'Song', 'Measure ');
    if (typeof measures === 'string') return { ok: false, error: measures };
    tracks = [{
      ...createTrack('fretted', 'guitar'),
      tuning: getStringPitches(requiredStringCount(measures, 6)),
      measures,
    }];
  }

  return {
    ok: true,
    song: {
      title,
      artist: typeof artist === 'string' && artist.trim().length > 0 ? artist : 'Unknown Artist',
      bpm,
      timeSignature,
      tracks: normalizeTrackLengths(tracks),
    },
  };
};
