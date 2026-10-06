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

/** How far a bend raises the string, in semitones: half a step or a full one. */
export type BendAmount = 1 | 2;

/** Where a slide into a note starts when it does not come from the note before. */
export type SlideIn = 'below' | 'above';

/** Which way a slide out of a note goes. */
export type SlideOut = 'down' | 'up';

export interface NoteTechniques {
  harmonic?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  vibrato?: boolean;
  ghostNote?: boolean;
  slur?: boolean;       // hammer-on/pull-off (curved bow to previous note on same string)
  legatoSlide?: boolean; // slide (diagonal line to previous note on same string)
  /** Held on from the same pitch in the beat right before: drawn tied, and not struck again. */
  tie?: boolean;
  /** A slide into the note from nowhere in particular; never with `legatoSlide`. */
  slideIn?: SlideIn;
  slideOut?: SlideOut;
  bend?: BendAmount;
  /** The bend lets back down to the fretted pitch within the note; only read with a bend. */
  bendRelease?: boolean;
}

export interface FrettedNote extends NoteTechniques {
  stringIndex: number; // 0 = highest string
  fret: number;        // 0 to 24
}

export interface PitchedNote extends NoteTechniques {
  midi: number;        // absolute sounding pitch
}

export type TabNote = FrettedNote | PitchedNote;

/**
 * A tuplet's count: three notes in the time of two, or six in the time of four.
 * Either way each note plays at ⅔ of its written length; the count only decides
 * how many notes one bracket holds.
 */
export type Tuplet = 3 | 6;

/**
 * A dynamic mark: ppp to fff, then fp (loud, at once soft), and the accents sfz and fz,
 * which strike one beat hard and leave the level where it was.
 */
export type Dynamic = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff' | 'fp' | 'sfz' | 'fz';

/** A hairpin over a run of beats: louder (crescendo) or softer (diminuendo) into the next mark. */
export type Hairpin = 'cresc' | 'dim';

/** An accent on a beat's notes: > (accent) or the stronger ^ (marcato). */
export type Accent = 'accent' | 'marcato';

export interface TabBeat {
  id: string;
  duration: Duration;
  dot?: boolean;
  tuplet?: Tuplet;
  notes: TabNote[];
  isRest?: boolean;
  /** A dynamic mark at this beat, holding until the next one. */
  dynamic?: Dynamic;
  /** Under a hairpin: consecutive beats with the same one make one wedge. */
  hairpin?: Hairpin;
  accent?: Accent;
}

export interface TabMeasure {
  id: string;
  beats: TabBeat[];
  bpm?: number;
  timeSignature?: TimeSignature;
  /** This track's own, so one part can repeat while another plays on: a ‖: opens a repeated section here. */
  repeatStart?: boolean;
  /** This track's own: a :‖ closes one here, and how many times the section plays in all. */
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
  /** `SONG_FORMAT` once read by this version; 1.0.0 songs have none and get converted. */
  format: number;
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

/** One drawn staff: how far below the row's origin it sits, the track whose bars it carries, and its clef at every bar. */
export interface Staff {
  top: number;
  track: number;
  clefs: Clef[];
}
