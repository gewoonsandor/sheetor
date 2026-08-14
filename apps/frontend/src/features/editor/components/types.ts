export type Duration = '1' | '2' | '4' | '8' | '16' | '32';

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface BeatPosition {
  measureIndex: number;
  beatIndex: number;
}

export interface TabNote {
  stringIndex: number; // 0 = high E, 5 = low E
  fret: number;        // 0 to 24
  harmonic?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  vibrato?: boolean;
  ghostNote?: boolean;
  slur?: boolean;       // hammer-on/pull-off (curved bow to previous note on same string)
  legatoSlide?: boolean; // slide (diagonal line to previous note on same string)
  bend?: boolean;
}

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
}

export interface TabSong {
  title: string;
  artist: string;
  bpm: number;
  timeSignature: TimeSignature;
  measures: TabMeasure[];
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
