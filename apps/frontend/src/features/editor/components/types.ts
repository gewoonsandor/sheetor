export type Duration = '1' | '2' | '4' | '8' | '16' | '32';

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface BeatPosition {
  measureIndex: number;
  beatIndex: number;
}

/** A beat position qualified by the track it belongs to. */
export interface TrackPosition extends BeatPosition {
  trackIndex: number;
}

export type InstrumentId =
  | 'guitar'
  | 'bass'
  | 'piano'
  | 'trumpet'
  | 'strings'
  | 'organ'
  | 'sine'
  | 'triangle'
  | 'square'
  | 'sawtooth';

/**
 * Which staves a track draws: standard notation, guitar TAB, or both stacked
 * (fretted tracks); notation only on pitched tracks, whose grand staff is a
 * pair of tracks (`TabTrack.bassTrack`) rather than a display.
 */
export type StaffDisplay = 'notation' | 'tab' | 'both';

/** The clef a notation staff is read in: treble (G) or bass (F). */
export type Clef = 'treble' | 'bass';

/**
 * Fretted tracks address pitch as string + fret against a tuning; pitched
 * tracks (piano, trumpet, ...) carry the absolute MIDI number instead. A
 * track's kind is **derived from its instrument** (`trackKind` in
 * `songUtils.ts`) and is deliberately not a field — a stored copy could
 * disagree with the instrument, which is how a guitar track lost its TAB.
 */
export type TrackKind = 'fretted' | 'pitched';

export interface NoteTechniques {
  harmonic?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  vibrato?: boolean;
  ghostNote?: boolean;
  slur?: boolean;       // hammer-on/pull-off (curved bow to previous note on same string)
  legatoSlide?: boolean; // slide (diagonal line to previous note on same string)
  bend?: boolean;
}

export interface FrettedNote extends NoteTechniques {
  stringIndex: number; // 0 = highest string
  fret: number;        // 0 to 24
}

export interface PitchedNote extends NoteTechniques {
  midi: number;        // absolute sounding pitch
}

export type TabNote = FrettedNote | PitchedNote;

export interface TabBeat {
  id: string;
  duration: Duration;
  dot?: boolean;
  notes: TabNote[];
  isRest?: boolean;
}

export interface TabMeasure {
  id: string;
  beats: TabBeat[];
  bpm?: number;
  timeSignature?: TimeSignature;
  /** Conductor only, like bpm: a ‖: opens a repeated section at this bar. */
  repeatStart?: boolean;
  /** Conductor only: a :‖ closes one here, and how many times the section plays in all. */
  repeatEnd?: number;
  /** This track's own: its staff switches to this clef here, until the next change. */
  clef?: Clef;
}

export interface TabTrack {
  id: string;
  name: string;
  display: StaffDisplay;
  instrument: InstrumentId;
  /** Fretted tracks only: MIDI pitch of each open string, highest first. */
  tuning?: number[];
  /**
   * Semitones the staff is written above what it sounds. Guitar and bass are
   * notated an octave high (12); concert-pitch instruments use 0.
   */
  transpose: number;
  /** Sharps (positive) or flats (negative) written at the start of every row; absent is C major. */
  keySignature?: number;
  /** The clef bar 1 opens in; absent is treble, or bass on a grand staff's lower staff. */
  clef?: Clef;
  /** Per-track trim, 0..1, multiplied into the master volume. */
  volume: number;
  muted?: boolean;
  soloed?: boolean;
  measures: TabMeasure[];
  /**
   * Pitched tracks only: the track drawn on the bass staff under this one. The
   * two are a grand staff, one hand each, so each keeps its own rhythm.
   */
  bassTrack?: string;
}

export interface TabSong {
  title: string;
  artist: string;
  bpm: number;
  timeSignature: TimeSignature;
  /** Track 0 is the conductor: its measure bpm/time-signature overrides win. */
  tracks: TabTrack[];
}

export interface BeamGroup {
  startIdx: number;
  endIdx: number;
  duration: '8' | '16' | '32';
}

export interface MLayout {
  row: number;
  x: number;
  width: number;
  padding: number;
}
