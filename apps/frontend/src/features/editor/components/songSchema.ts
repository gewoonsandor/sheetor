import type {
  Clef, Duration, InstrumentId, StaffDisplay, TabBeat, TabMeasure, TabNote, TabSong,
  TabTrack, TimeSignature,
} from './types';
import {
  ACCENTS, DEFAULT_TRANSPOSE, DURATIONS, DYNAMICS, HAIRPINS, MAX_BPM, MAX_FRET, MAX_KEY_ACCIDENTALS, MAX_REPEAT, MAX_STRINGS, MIN_BPM, MIN_REPEAT,
  STAFF_DISPLAYS,
  TECHNIQUE_KEYS,
  createId, createTrack, defaultTuning, normalizeTrackLengths, pruneNotesToStringCount, requiredStringCount,
  resizeTuning, trackKind,
} from './songUtils';

export type ParseSongResult =
  | { ok: true; song: TabSong }
  | { ok: false; error: string };

const MIN_MIDI = 0;
const MAX_MIDI = 127;
const VALID_DENOMINATORS = [1, 2, 4, 8, 16];

const INSTRUMENT_IDS: readonly InstrumentId[] = [
  'guitar', 'bass', 'piano', 'trumpet', 'strings', 'organ',
  'sine', 'triangle', 'square', 'sawtooth',
];

/** The instrument's standard tuning, with strings added for any note that needs one. */
const fallbackTuning = (instrument: InstrumentId, measures: TabMeasure[]): number[] => {
  const standard = defaultTuning(instrument);
  return resizeTuning(standard, requiredStringCount(measures, standard.length));
};

// Technique flags are copied only when explicitly true, so a stored `false`
// or a stray non-boolean never survives into the model. TECHNIQUE_KEYS lives
// in songUtils because note conversion needs the same list.

// Canonical object guard for this validation boundary: it proves an object, so
// every field below is still checked with typeof / Array.isArray.
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDuration = (value: unknown): value is Duration =>
  typeof value === 'string' && (DURATIONS as readonly string[]).includes(value);

const isValidBpm = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM;

const isClef = (value: unknown): value is Clef => value === 'treble' || value === 'bass';

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
      stringIndex >= MAX_STRINGS
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
  // A bend is ½ or a full step; one saved before bends had amounts was drawn as full.
  const bend = value.bend === true ? 2 : value.bend;
  if (bend === 1 || bend === 2) {
    note.bend = bend;
    if (value.bendRelease === true) note.bendRelease = true;
  }
  // A slide comes into a note from the note before or from below or above, never both.
  if ((value.slideIn === 'below' || value.slideIn === 'above') && !note.legatoSlide) note.slideIn = value.slideIn;
  if (value.slideOut === 'down' || value.slideOut === 'up') note.slideOut = value.slideOut;
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
  if (value.tuplet === 3 || value.tuplet === 6) beat.tuplet = value.tuplet;
  if (value.isRest === true) beat.isRest = true;
  const dynamic = DYNAMICS.find(d => d === value.dynamic);
  if (dynamic) beat.dynamic = dynamic;
  const hairpin = HAIRPINS.find(h => h === value.hairpin);
  if (hairpin) beat.hairpin = hairpin;
  const accent = ACCENTS.find(a => a === value.accent);
  if (accent) beat.accent = accent;
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
  if (value.repeatStart === true) measure.repeatStart = true;
  const times = value.repeatEnd;
  if (typeof times === 'number' && Number.isInteger(times) && times >= MIN_REPEAT && times <= MAX_REPEAT) {
    measure.repeatEnd = times;
  }
  if (isClef(value.clef)) measure.clef = value.clef;
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
  // The instrument decides the kind; a stored `kind` is ignored so a file can
  // never describe a guitar track that renders without TAB.
  const kind = trackKind(instrument);
  // A pitched track has no TAB, whatever the file claims; an old one-track grand staff reads as notes.
  const allowed = STAFF_DISPLAYS[kind];
  const display = allowed.includes(value.display as StaffDisplay) ? (value.display as StaffDisplay) : allowed[0];

  const track: TabTrack = {
    id: parseId(value.id),
    name: typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name
      : createTrack(instrument).name,
    display,
    instrument,
    transpose: typeof value.transpose === 'number' && Number.isFinite(value.transpose)
      ? value.transpose
      : DEFAULT_TRANSPOSE[instrument],
    volume: typeof value.volume === 'number' && value.volume >= 0 && value.volume <= 1
      ? value.volume
      : 1,
    // A pitched staff has no strings, so a fret written onto one has no pitch; older
    // builds let number keys do that, and the note rendered as NaN.
    measures: kind === 'pitched' ? pruneNotesToStringCount(measures, 0) : measures,
  };

  if (kind === 'fretted') {
    const raw = value.tuning;
    const valid = Array.isArray(raw)
      && raw.length > 0
      && raw.every(p => typeof p === 'number' && Number.isFinite(p));
    // Tuning must still cover every note the track actually contains.
    track.tuning = valid
      ? (raw as number[])
      : fallbackTuning(instrument, measures);
  }
  if (value.muted === true) track.muted = true;
  if (value.soloed === true) track.soloed = true;
  const key = value.keySignature;
  if (typeof key === 'number' && Number.isInteger(key) && key !== 0 && Math.abs(key) <= MAX_KEY_ACCIDENTALS) {
    track.keySignature = key;
  }
  if (isClef(value.clef)) track.clef = value.clef;
  // Whether it names a usable partner is decided where it is read (`grandStaffOf`).
  if (typeof value.bassTrack === 'string') track.bassTrack = value.bassTrack;

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
      ...createTrack('guitar'),
      tuning: fallbackTuning('guitar', measures),
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
