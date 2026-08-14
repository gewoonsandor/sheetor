import React, { useState, useEffect, useRef } from 'react';
import './TabSheetEditor.css';

import type { Duration, TabNote, TabBeat, TabMeasure, TabSong, BeamGroup, MLayout } from './types';
import {
  getStringPitches,
  allStringPitches,
  getDurationVal,
  computeBeamGroups,
  midiToNoteName,
  midiToNoteOctave,
  noteOctaveToMidi,
  GUITAR_NOTE_OPTIONS,
  midiToDiatonicAndAccidental,
  Y_of_step,
  createEmptyMeasure,
  createEmptySong,
  createId,
  getEffectiveBpm,
  getEffectiveTimeSignature,
  pruneNotesToStringCount,
  requiredStringCount,
} from './songUtils';
import { parseSong } from './songSchema';
import { loadSong, saveSong } from './persistence';
import { usePlayback } from './usePlayback';
import {
  computeRowHeight,
  computeMeasureLayouts,
  checkMeasureBeats,
  computeFretboardNeckHeight,
  getFretboardStringY as getFretboardStringYFromLayout,
  getFretCellLeft,
  getFretCellWidth,
  getFretLeftPercentage,
  FRET_COUNT as fretCount,
  MAX_ROW_WIDTH,
  STEM_TOP_PAD,
  TAB_STAFF_TOP,
  TAB_STAFF_HEIGHT_PX,
} from './layout';

// Standard guitar tunings (MIDI pitches, high string first)
const STANDARD_TUNINGS: Record<string, number[]> = {
  'Standard': [64, 59, 55, 50, 45, 40],
  'Drop D': [64, 59, 55, 50, 45, 38],
  'Half step down': [63, 58, 54, 49, 44, 39],
  'Full step down': [62, 57, 53, 48, 43, 38],
  'Drop C#': [63, 58, 54, 49, 44, 37],
  'Drop C': [62, 57, 53, 48, 43, 36],
  'Open G': [62, 59, 55, 50, 43, 38],
  'Open D': [62, 57, 54, 50, 45, 38],
  'Open A': [64, 59, 55, 50, 47, 40],
  'DADGAD': [62, 57, 55, 50, 45, 38],
};

const TUNING_PRESETS = Object.entries(STANDARD_TUNINGS);

export const TabSheetEditor: React.FC = () => {
  // --- STATE ---

  const [song, setSong] = useState<TabSong>(() => loadSong(createEmptySong()));
  const [activeMeasureIndex, setActiveMeasureIndex] = useState<number>(0);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [activeStringIndex, setActiveStringIndex] = useState<number>(0);

  // Tuning is not persisted, so widen it to cover every note the loaded song
  // has; otherwise those notes render and play with an undefined pitch.
  const [tuning, setTuning] = useState<number[]>(() => getStringPitches(requiredStringCount(song, 6)));
  const stringCount = tuning.length;
  

  
  const [durationSelect, setDurationSelect] = useState<Duration>('4');
  const [dotSelect, setDotSelect] = useState<boolean>(false);
  const [synthType, setSynthType] = useState<string>('guitar');
  const [volume, setVolume] = useState<number>(0.8);
  const [viewMode, setViewMode] = useState<boolean>(false);
  const [showFretboard, setShowFretboard] = useState<boolean>(true);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showNoteOptions, setShowNoteOptions] = useState<boolean>(false);
  const [openBottomMenu, setOpenBottomMenu] = useState<'song' | 'edit' | 'sound' | 'speed' | 'tuning' | null>(null);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(false);

  // Import/Export Modal state
  const [modalOpen, setModalOpen] = useState<'import' | 'export' | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<string>('');

  // Keyboard navigation & double-digit entry ref

  const lastKeyTimeRef = useRef<number>(0);
  const lastKeyStringRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  const playback = usePlayback(
    { song, tuning, volume, synthType, loop: loopPlayback, speed: playbackSpeed },
    (position) => {
      setActiveMeasureIndex(position.measureIndex);
      setActiveBeatIndex(position.beatIndex);
    },
  );

  const startPlaybackFromCursor = () =>
    playback.start({ measureIndex: activeMeasureIndex, beatIndex: activeBeatIndex });

  // Auto-save song to localStorage on every change
  useEffect(() => {
    saveSong(song);
  }, [song]);

  // --- STATE EDITORS ---

  const getActiveBeat = (): TabBeat | undefined => {
    return song.measures[activeMeasureIndex]?.beats[activeBeatIndex];
  };

  const setActiveMeasureBpm = (bpm: number) => {
    setSong(prev => ({
      ...prev,
      bpm: activeMeasureIndex === 0 ? bpm : prev.bpm,
      measures: prev.measures.map((measure, index) => {
        if (index !== activeMeasureIndex) return measure;
        if (activeMeasureIndex === 0) {
          const normalized = { ...measure };
          delete normalized.bpm;
          return normalized;
        }
        return { ...measure, bpm };
      })
    }));
  };

  const setActiveMeasureTimeSignature = (field: 'numerator' | 'denominator', value: number) => {
    setSong(prev => {
      const effective = (() => {
        for (let i = activeMeasureIndex; i >= 0; i--) {
          const ts = prev.measures[i]?.timeSignature;
          if (ts) return ts;
        }
        return prev.timeSignature;
      })();
      const nextTimeSignature = { ...effective, [field]: value };
      return {
        ...prev,
        timeSignature: activeMeasureIndex === 0 ? nextTimeSignature : prev.timeSignature,
        measures: prev.measures.map((measure, index) => {
          if (index !== activeMeasureIndex) return measure;
          if (activeMeasureIndex === 0) {
            const normalized = { ...measure };
            delete normalized.timeSignature;
            return normalized;
          }
          return {
            ...measure,
            timeSignature: nextTimeSignature
          };
        })
      };
    });
  };

  const updateActiveBeatNotes = (updateFn: (notes: TabNote[]) => TabNote[]) => {
    setSong(prevSong => {
      const nextMeasures = prevSong.measures.map((m, mIdx) => {
        if (mIdx !== activeMeasureIndex) return m;
        return {
          ...m,
          beats: m.beats.map((b, bIdx) => {
            if (bIdx !== activeBeatIndex) return b;
            const newNotes = updateFn(b.notes);
            return {
              ...b,
              notes: newNotes,
              isRest: newNotes.length === 0
            };
          })
        };
      });
      return { ...prevSong, measures: nextMeasures };
    });
  };

  const setFretForActiveNote = (stringIndex: number, fret: number) => {
    updateActiveBeatNotes(currentNotes => {
      const existing = currentNotes.find(n => n.stringIndex === stringIndex);
      const filtered = currentNotes.filter(n => n.stringIndex !== stringIndex);
      if (fret >= 0) {
        filtered.push({ ...(existing || {}), stringIndex, fret });
        // Play instant auditory preview
        const midi = tuning[stringIndex] + fret;
        playback.playTone(midi);
      }
      return filtered;
    });
    // Set active string
    setActiveStringIndex(stringIndex);
  };

  const toggleNoteTechnique = (technique: keyof Pick<TabNote, 'harmonic' | 'palmMute' | 'letRing' | 'vibrato' | 'ghostNote' | 'slur' | 'legatoSlide' | 'bend'>) => {
    updateActiveBeatNotes(currentNotes => {
      const existing = currentNotes.find(n => n.stringIndex === activeStringIndex);
      if (!existing) return currentNotes;
      return currentNotes.map(n =>
        n.stringIndex === activeStringIndex
          ? { ...n, [technique]: !n[technique] }
          : n
      );
    });
  };

  const removeActiveNoteOnString = (stringIndex: number) => {
    updateActiveBeatNotes(currentNotes => {
      return currentNotes.filter(n => n.stringIndex !== stringIndex);
    });
  };

  const toggleActiveBeatRest = () => {
    setSong(prevSong => {
      const nextMeasures = prevSong.measures.map((m, mIdx) => {
        if (mIdx !== activeMeasureIndex) return m;
        return {
          ...m,
          beats: m.beats.map((b, bIdx) => {
            if (bIdx !== activeBeatIndex) return b;
            const newRest = !b.isRest;
            return {
              ...b,
              isRest: newRest,
              // Keep notes but make them inactive when it's a rest
              notes: newRest ? [] : b.notes
            };
          })
        };
      });
      return { ...prevSong, measures: nextMeasures };
    });
  };

  const setDurationForActiveBeat = (dur: Duration) => {
    setSong(prevSong => {
      const nextMeasures = prevSong.measures.map((m, mIdx) => {
        if (mIdx !== activeMeasureIndex) return m;
        return {
          ...m,
          beats: m.beats.map((b, bIdx) => {
            if (bIdx !== activeBeatIndex) return b;
            return { ...b, duration: dur };
          })
        };
      });
      return { ...prevSong, measures: nextMeasures };
    });
  };

  const toggleDotForActiveBeat = () => {
    setSong(prevSong => {
      const nextMeasures = prevSong.measures.map((m, mIdx) => {
        if (mIdx !== activeMeasureIndex) return m;
        return {
          ...m,
          beats: m.beats.map((b, bIdx) => {
            if (bIdx !== activeBeatIndex) return b;
            return { ...b, dot: !b.dot };
          })
        };
      });
      return { ...prevSong, measures: nextMeasures };
    });
    setDotSelect(prev => !prev);
  };

  // Grid/beat manipulation
  const insertBeatAfterActive = () => {
    setSong(prevSong => {
      const nextMeasures = prevSong.measures.map((m, mIdx) => {
        if (mIdx !== activeMeasureIndex) return m;
        const newBeat: TabBeat = {
          id: createId(),
          duration: durationSelect,
          dot: dotSelect,
          notes: [],
          isRest: true
        };
        const nextBeats = [...m.beats];
        nextBeats.splice(activeBeatIndex + 1, 0, newBeat);
        return { ...m, beats: nextBeats };
      });
      return { ...prevSong, measures: nextMeasures };
    });
    // Move cursor to new beat
    setActiveBeatIndex(prev => prev + 1);
  };

  const deleteActiveBeat = () => {
    const measure = song.measures[activeMeasureIndex];
    if (!measure) return;
    
    // Don't delete if it's the last beat of the last measure
    if (measure.beats.length <= 1 && song.measures.length <= 1) {
      // Just clear it
      updateActiveBeatNotes(() => []);
      return;
    }

    setSong(prevSong => {
      const nextMeasures = prevSong.measures.map((m, mIdx) => {
        if (mIdx !== activeMeasureIndex) return m;
        const filteredBeats = m.beats.filter((_, idx) => idx !== activeBeatIndex);
        return { ...m, beats: filteredBeats };
      }).filter(m => m.beats.length > 0);

      return { ...prevSong, measures: nextMeasures };
    });

    // Reset indices
    if (measure.beats.length <= 1) {
      // The current measure was deleted
      setActiveMeasureIndex(prev => Math.max(0, prev - 1));
      setActiveBeatIndex(0);
    } else {
      setActiveBeatIndex(prev => Math.max(0, prev - 1));
    }
  };

  const addMeasure = () => {
    setSong(prev => ({
      ...prev,
      measures: [...prev.measures, createEmptyMeasure()]
    }));
    setActiveMeasureIndex(song.measures.length);
    setActiveBeatIndex(0);
  };

  const insertMeasureAfterActive = () => {
    setSong(prev => {
      const list = [...prev.measures];
      list.splice(activeMeasureIndex + 1, 0, createEmptyMeasure());
      return { ...prev, measures: list };
    });
    setActiveMeasureIndex(prev => prev + 1);
    setActiveBeatIndex(0);
  };

  const deleteActiveMeasure = () => {
    if (song.measures.length <= 1) return; // Keep at least one
    setSong(prev => ({
      ...prev,
      measures: prev.measures.filter((_, idx) => idx !== activeMeasureIndex)
    }));
    setActiveMeasureIndex(prev => Math.max(0, prev - 1));
    setActiveBeatIndex(0);
  };

  const duplicateActiveMeasure = () => {
    const currentM = song.measures[activeMeasureIndex];
    if (!currentM) return;
    
    // Spread the source so measure-level bpm / time signature overrides survive.
    const copy: TabMeasure = {
      ...currentM,
      id: createId(),
      beats: currentM.beats.map(b => ({
        ...b,
        id: createId(),
        notes: b.notes.map(n => ({ ...n }))
      }))
    };

    setSong(prev => {
      const list = [...prev.measures];
      list.splice(activeMeasureIndex + 1, 0, copy);
      return { ...prev, measures: list };
    });
    setActiveMeasureIndex(prev => prev + 1);
    setActiveBeatIndex(0);
  };

  const clearSong = () => {
    playback.stop();
    setSong(createEmptySong());
    setActiveMeasureIndex(0);
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
  };

  // --- KEYBOARD CONTROLS ---

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // If typing in input fields, ignore shortcuts
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (viewMode) return;

    const measure = song.measures[activeMeasureIndex];
    if (!measure) return;
    const beat = measure.beats[activeBeatIndex];

    switch (e.key) {
      // Arrow navigation
      case 'ArrowUp':
        e.preventDefault();
        setActiveStringIndex(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveStringIndex(prev => Math.min(stringCount - 1, prev + 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (activeBeatIndex > 0) {
          setActiveBeatIndex(prev => prev - 1);
        } else if (activeMeasureIndex > 0) {
          const prevMIdx = activeMeasureIndex - 1;
          setActiveMeasureIndex(prevMIdx);
          setActiveBeatIndex(song.measures[prevMIdx].beats.length - 1);
        }
        break;
      case 'ArrowRight': {
        e.preventDefault();
        const measureDur = measure.beats.reduce((acc, b) => acc + getDurationVal(b.duration, b.dot), 0);
        const timeSignature = getEffectiveTimeSignature(song, activeMeasureIndex);
        const targetDur = timeSignature.numerator * (4 / timeSignature.denominator);

        if (activeBeatIndex < measure.beats.length - 1) {
          setActiveBeatIndex(prev => prev + 1);
        } else {
          // On the last beat of the measure
          if (measureDur < targetDur - 0.001) {
            // Bar is not filled yet, create a new beat with same length
            const prevDuration = beat ? beat.duration : durationSelect;
            const newBeat: TabBeat = {
              id: createId(),
              duration: prevDuration,
              notes: [],
              isRest: true
            };
            setSong(prev => {
              const list = prev.measures.map((m, mIdx) => {
                if (mIdx !== activeMeasureIndex) return m;
                return {
                  ...m,
                  beats: [...m.beats, newBeat]
                };
              });
              return { ...prev, measures: list };
            });
            setActiveBeatIndex(prev => prev + 1);
          } else if (activeMeasureIndex < song.measures.length - 1) {
            // Bar is filled, go to next measure
            setActiveMeasureIndex(prev => prev + 1);
            setActiveBeatIndex(0);
          } else {
            // Last bar is filled and we're on the last measure — create a new bar
            const prevDuration = beat ? beat.duration : durationSelect;
            const newMeasure: TabMeasure = {
              id: createId(),
              beats: [{
                id: createId(),
                duration: prevDuration,
                notes: [],
                isRest: true
              }]
            };
            setSong(prev => ({
              ...prev,
              measures: [...prev.measures, newMeasure]
            }));
            setActiveMeasureIndex(prev => prev + 1);
            setActiveBeatIndex(0);
          }
        }
        break;
      }

      // Spacebar toggles playback
      case ' ':
        e.preventDefault();
        if (playback.isPlaying) {
          playback.stop();
        } else {
          startPlaybackFromCursor();
        }
        break;

      // Note technique shortcuts (when note options panel is open)
      case 'h':
      case 'H':
        e.preventDefault();
        toggleNoteTechnique('slur');
        break;
      case 's':
      case 'S':
        e.preventDefault();
        toggleNoteTechnique('legatoSlide');
        break;
      case 'v':
      case 'V':
        e.preventDefault();
        toggleNoteTechnique('vibrato');
        break;
      case 'b':
      case 'B':
        e.preventDefault();
        toggleNoteTechnique('bend');
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleNoteTechnique('palmMute');
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        toggleNoteTechnique('letRing');
        break;
      case 'o':
      case 'O':
        e.preventDefault();
        toggleNoteTechnique('harmonic');
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        toggleNoteTechnique('ghostNote');
        break;

      // Delete / Backspace removes a note, or deletes the beat if it's a rest
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        if (beat?.isRest) {
          deleteActiveBeat();
        } else if (showNoteOptions) {
          removeActiveNoteOnString(activeStringIndex);
          setShowNoteOptions(false);
        } else {
          removeActiveNoteOnString(activeStringIndex);
        }
        break;

      // Rest hotkey (or toggle + close panel)
      case 'r':
      case 'R':
        e.preventDefault();
        toggleActiveBeatRest();
        if (showNoteOptions) setShowNoteOptions(false);
        break;

      // Dot hotkey to toggle dotted note
      case '.':
        e.preventDefault();
        toggleDotForActiveBeat();
        if (showNoteOptions) setShowNoteOptions(false);
        break;

      // Plus / Equals / Minus to change duration (increase/decrease)
      case '=':
      case '+': {
        e.preventDefault();
        const durOrder: Duration[] = ['32', '16', '8', '4', '2', '1'];
        const currentDur = beat ? beat.duration : durationSelect;
        const currentIndex = durOrder.indexOf(currentDur);
        const nextIndex = Math.min(durOrder.length - 1, currentIndex + 1);
        const newDur = durOrder[nextIndex];
        setDurationForActiveBeat(newDur);
        setDurationSelect(newDur);
        break;
      }
      case '-':
      case '_': {
        e.preventDefault();
        const durOrder: Duration[] = ['32', '16', '8', '4', '2', '1'];
        const currentDur = beat ? beat.duration : durationSelect;
        const currentIndex = durOrder.indexOf(currentDur);
        const nextIndex = Math.max(0, currentIndex - 1);
        const newDur = durOrder[nextIndex];
        setDurationForActiveBeat(newDur);
        setDurationSelect(newDur);
        break;
      }

      default:
        // Handle number entry (0 to 9) with multi-digit parsing (e.g. typing 1 then 2 = fret 12)
        if (/[0-9]/.test(e.key)) {
          e.preventDefault();
          const now = Date.now();
          let fretVal = parseInt(e.key);

          // If the last key was pressed less than 800ms ago and was a number
          if (now - lastKeyTimeRef.current < 800 && /[0-9]/.test(lastKeyStringRef.current)) {
            const combinedStr = lastKeyStringRef.current + e.key;
            const combinedVal = parseInt(combinedStr);
            if (combinedVal <= 24) {
              fretVal = combinedVal;
              lastKeyStringRef.current = combinedStr;
            } else {
              lastKeyStringRef.current = e.key;
            }
          } else {
            lastKeyStringRef.current = e.key;
          }
          lastKeyTimeRef.current = now;
          setFretForActiveNote(activeStringIndex, fretVal);
        }
        break;
    }
  };

  // Focus the container so it captures keys immediately. Never during playback
  // (the cursor moves every beat) and never while a form control has focus,
  // otherwise the title, bpm and tuning inputs become untypeable.
  useEffect(() => {
    if (playback.isPlaying) return;
    const el = containerRef.current;
    if (!el) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) return;
    el.focus();
  }, [activeBeatIndex, activeMeasureIndex, playback.isPlaying]);

  useEffect(() => {
    if (!showShortcuts && !openBottomMenu && !showNoteOptions) return;

    const handleOverlayKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setOpenBottomMenu(null);
        setShowNoteOptions(false);
      }
    };

    window.addEventListener('keydown', handleOverlayKeyDown);
    return () => window.removeEventListener('keydown', handleOverlayKeyDown);
  }, [showShortcuts, openBottomMenu, showNoteOptions]);

  // --- SVG MEASUREMENT & LAYOUT CALCULATION ---

  const ROW_HEIGHT = computeRowHeight(stringCount);

  const measureLayouts: MLayout[] = computeMeasureLayouts(song.measures);

  // Compute TAB shift per measure: extra gap to avoid stems overlapping TAB
  const measureTabOffsets: number[] = song.measures.map((measure) => {
    let minStep = 4;
    for (const beat of measure.beats) {
      if (beat.isRest) continue;
      for (const note of beat.notes) {
        const midi = tuning[note.stringIndex] + note.fret;
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        if (diatonicStep < minStep) minStep = diatonicStep;
      }
    }
    const overlap = -minStep * 5 + 8;
    return overlap > 0 ? Math.ceil(overlap / 10) * 10 : 0;
  });

  // Per-row max offset for TAB shift
  const rowExtra: number[] = [];
  measureLayouts.forEach((l, i) => {
    const r = l.row;
    rowExtra[r] = Math.max(rowExtra[r] || 0, measureTabOffsets[i]);
  });

  // Per-row extra top padding for very high notes (stems/beams above the staff)
  const rowHighExtra: number[] = [];
  song.measures.forEach((measure, mIdx) => {
    const r = measureLayouts[mIdx]?.row ?? 0;
    let minNoteY = 0;
    for (const beat of measure.beats) {
      if (beat.isRest || beat.notes.length === 0) continue;
      for (const note of beat.notes) {
        const midi = tuning[note.stringIndex] + note.fret;
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        const y = Y_of_step(diatonicStep);
        if (y < minNoteY) minNoteY = y;
      }
    }
    if (minNoteY < 0) {
      const stemTop = minNoteY - 32;
      const need = -stemTop;
      const extra = Math.max(0, need - STEM_TOP_PAD);
      if (extra > 0) rowHighExtra[r] = Math.max(rowHighExtra[r] || 0, extra);
    }
  });

  // Row Y cumulative offset (base row height + extra spacing)
  const rowYOffsets: number[] = [];
  let cumY = STEM_TOP_PAD;
  for (let r = 0; r < Math.max(rowExtra.length, rowHighExtra.length); r++) {
    cumY += rowHighExtra[r] || 0;
    rowYOffsets[r] = cumY;
    cumY += ROW_HEIGHT + (rowExtra[r] || 0);
  }

  const getRowY = (index: number): number => {
    const r = measureLayouts[index]?.row ?? 0;
    return rowYOffsets[r] ?? STEM_TOP_PAD;
  };

  const totalSVGHeight = cumY + 10;

  const getMeasureWidth = (index: number): number => measureLayouts[index]?.width ?? 0;
  const getMeasurePadding = (index: number): number => measureLayouts[index]?.padding ?? 18;
  const getMeasureX = (index: number): number => measureLayouts[index]?.x ?? 0;
  const getRowShift = (index: number): number => {
    const r = measureLayouts[index]?.row ?? 0;
    return rowExtra[r] || 0;
  };

  const fretboardNeckHeight = computeFretboardNeckHeight(stringCount);

  const getFretboardStringY = (stringIdx: number): number =>
    getFretboardStringYFromLayout(stringIdx, stringCount);

  // Calculate coordinates for beats inside a measure
  const getBeatCoordinates = (mIdx: number, bIdx: number): number => {
    const measure = song.measures[mIdx];
    const measureX = getMeasureX(mIdx);
    const padding = getMeasurePadding(mIdx);
    const width = getMeasureWidth(mIdx);
    const usableWidth = width - padding - 20;

    // Center a single beat inside the measure's usable area
    if (measure.beats.length === 1) {
      return measureX + padding + usableWidth / 2;
    }

    // Compressed proportional positioning using sqrt(duration)
    let totalWeight = 0;
    const beatWeights: number[] = [];
    measure.beats.forEach((b) => {
      beatWeights.push(totalWeight);
      totalWeight += Math.sqrt(getDurationVal(b.duration, b.dot));
    });

    return measureX + padding + ((beatWeights[bIdx] || 0) / totalWeight) * usableWidth;
  };

  // Determine the unified stem direction for a beam group
  const getBeamStemUp = (measure: TabMeasure, beamGroup: BeamGroup): boolean => {
    let anyBelow = false;
    let anyAbove = false;
    let maxDist = 0;
    let dirUp = true;
    for (let i = beamGroup.startIdx; i <= beamGroup.endIdx; i++) {
      const beat = measure.beats[i];
      if (!beat) continue;
      for (const note of beat.notes) {
        const midi = tuning[note.stringIndex] + note.fret;
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        if (diatonicStep < 0) anyBelow = true;
        if (diatonicStep > 12) anyAbove = true;
        const dist = Math.abs(diatonicStep - 6);
        if (dist > maxDist) {
          maxDist = dist;
          dirUp = diatonicStep < 6;
        }
      }
    }
    if (anyBelow && !anyAbove) return true;
    if (anyAbove && !anyBelow) return false;
    return dirUp;
  };

  // Calculate beam Y position for a beam group (standard notation)
  const getBeamY = (measure: TabMeasure, beamGroup: BeamGroup, stemUp: boolean): number => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = beamGroup.startIdx; i <= beamGroup.endIdx; i++) {
      const b = measure.beats[i];
      if (!b || b.isRest || b.notes.length === 0) continue;
      const rowY = getRowY(song.measures.indexOf(measure));
      for (const n of b.notes) {
        const midi = tuning[n.stringIndex] + n.fret;
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        const y = rowY + Y_of_step(diatonicStep);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (stemUp) return (minY === Infinity ? 0 : minY) - 30;
    return (maxY === -Infinity ? 0 : maxY) + 30;
  };

  // Auto-scroll during playback to keep playhead visible
  useEffect(() => {
    const beat = playback.playbackBeat;
    if (!beat || !containerRef.current) return;
    const mIdx = beat.measureIndex;
    const beatX = getBeatCoordinates(mIdx, beat.beatIndex);
    const rowY = getRowY(mIdx);
    const container = containerRef.current;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const scale = container.clientWidth / MAX_ROW_WIDTH;
    const scrollTargetX = beatX * scale - container.clientWidth / 3;
    const scrollTargetY = rowY * scale - container.clientHeight / 3;
    container.scrollTo({
      left: Math.max(0, scrollTargetX),
      top: Math.max(0, scrollTargetY),
      behavior: 'smooth',
    });
  }, [playback.playbackBeat, measureLayouts]);

  // Map standard notation click to pitch & tab note
  const handleStandardStaffClick = (mIdx: number, beatId: string, clickY: number) => {
    const step = Math.round((60 - clickY) / 5);

    const midiTable: Record<number, number> = {
      [-12]: 40, [-11]: 41, [-10]: 43, [-9]: 45, [-8]: 47, [-7]: 48,
      [-6]: 50, [-5]: 52, [-4]: 53, [-3]: 55, [-2]: 57, [-1]: 59,
      [0]: 60, [1]: 62, [2]: 64, [3]: 65, [4]: 67, [5]: 69,
      [6]: 71, [7]: 72, [8]: 74, [9]: 76, [10]: 77, [11]: 79,
      [12]: 81, [13]: 83, [14]: 84, [15]: 86, [16]: 88,
    };

    let targetMidi = midiTable[step];
    if (targetMidi === undefined) {
      targetMidi = step < -12 ? 40 : 88;
    }

    let bestString = activeStringIndex;
    let bestFret = -1;
    let minCost = Infinity;

    for (let s = 0; s < stringCount; s++) {
      const baseMidi = tuning[s];
      const fret = targetMidi - baseMidi;
      if (fret >= 0 && fret <= 22) {
        const cost = Math.abs(fret - 3) * 0.4 + Math.abs(s - activeStringIndex) * 1.0;
        if (cost < minCost) {
          minCost = cost;
          bestString = s;
          bestFret = fret;
        }
      }
    }

    if (bestFret !== -1) {
      setActiveMeasureIndex(mIdx);
      const bIdx = song.measures[mIdx].beats.findIndex(b => b.id === beatId);
      setActiveBeatIndex(bIdx);
      setFretForActiveNote(bestString, bestFret);
    }
  };

  // --- EXPORT / IMPORT LOGIC ---

  const handleExport = () => {
    setJsonText(JSON.stringify(song, null, 2));
    setModalOpen('export');
    setModalStatus('');
  };

  const handleImport = () => {
    setJsonText('');
    setModalOpen('import');
    setModalStatus('');
  };

  const copyToClipboard = () => {
    const clearStatusSoon = () => setTimeout(() => setModalStatus(''), 2000);
    if (!navigator.clipboard) {
      setModalStatus('Copy failed — select the text and copy manually.');
      clearStatusSoon();
      return;
    }
    navigator.clipboard.writeText(jsonText)
      .then(() => {
        setModalStatus('JSON copied to clipboard!');
        clearStatusSoon();
      })
      .catch(() => {
        setModalStatus('Copy failed — select the text and copy manually.');
        clearStatusSoon();
      });
  };

  const downloadJsonFile = () => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.title.toLowerCase().replace(/\s+/g, '_')}_tab.json`;
    a.click();
    URL.revokeObjectURL(url);
    setModalStatus('File downloaded!');
    setTimeout(() => setModalStatus(''), 2000);
  };

  const executeImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setModalStatus(`Error: ${err instanceof Error ? err.message : 'Invalid JSON format'}`);
      return;
    }

    const result = parseSong(parsed);
    if (!result.ok) {
      setModalStatus(`Error: ${result.error}`);
      return;
    }

    setSong(result.song);
    // An imported song may reach strings the current tuning does not have.
    setTuning(prev => getStringPitches(requiredStringCount(result.song, prev.length)));
    setActiveMeasureIndex(0);
    setActiveBeatIndex(0);
    setModalOpen(null);
  };



  // --- RENDER HELPERS ---

  const activeBeat = getActiveBeat();
  const selectedNotes = activeBeat?.notes ?? [];
  const activeNote = selectedNotes.find(n => n.stringIndex === activeStringIndex);
  const activeMeasureBpm = getEffectiveBpm(song, activeMeasureIndex);
  const activeMeasureTimeSignature = getEffectiveTimeSignature(song, activeMeasureIndex);

  const selectNote = (mIdx: number, bIdx: number, stringIdx: number) => {
    const wasSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx && activeStringIndex === stringIdx;
    setActiveMeasureIndex(mIdx);
    setActiveBeatIndex(bIdx);
    setActiveStringIndex(stringIdx);
    setShowNoteOptions(wasSelected);
  };

  const durationButtons = (['1', '2', '4', '8', '16', '32'] as const).map((dur) => (
    <button
      key={dur}
      className={`duration-btn ${durationSelect === dur ? 'active' : ''}`}
      onClick={() => {
        setDurationSelect(dur);
        setDurationForActiveBeat(dur);
      }}
      title={`Set note length: ${dur === '1' ? 'Whole' : dur === '2' ? 'Half' : dur === '4' ? 'Quarter' : dur === '8' ? 'Eighth' : dur === '16' ? 'Sixteenth' : 'Thirty-Second'}`}
    >
      {dur === '1' && (
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
          <ellipse cx="12" cy="12" rx="6" ry="4" transform="rotate(-20 12 12)" />
        </svg>
      )}
      {dur === '2' && (
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" strokeWidth="2.2" />
        </svg>
      )}
      {dur === '4' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      )}
      {dur === '8' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
          <path d="M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6" />
        </svg>
      )}
      {dur === '16' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
          <path d="M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6" />
          <path d="M 15 7.5 C 18 9.5, 20 13.5, 18 16.5 C 17.5 13.5, 16 10.5, 15 9.5" />
        </svg>
      )}
      {dur === '32' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
          <path d="M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6" />
          <path d="M 15 7.5 C 18 9.5, 20 13.5, 18 16.5 C 17.5 13.5, 16 10.5, 15 9.5" />
          <path d="M 15 11 C 18 13, 20 17, 18 20 C 17.5 17, 16 14, 15 13" />
        </svg>
      )}
      <span className="duration-label">
        {dur === '1' ? '1/1' : dur === '2' ? '1/2' : dur === '4' ? '1/4' : dur === '8' ? '1/8' : dur === '16' ? '1/16' : '1/32'}
      </span>
    </button>
  ));

  const dotButton = (
    <button
      className={`duration-btn ${(activeBeat?.dot ?? dotSelect) ? 'active' : ''}`}
      onClick={() => {
        toggleDotForActiveBeat();
      }}
      title="Dotted note"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <circle cx="18" cy="18" r="3" />
        <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
        <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
      </svg>
      <span className="duration-label">.</span>
    </button>
  );

  return (
    <div 
      className="sheetor-container"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Top Header */}
      <div className="sheetor-header">
        <div className="sheetor-title-section">
          <input
            className="sheetor-title-input"
            value={song.title}
            onChange={(e) => setSong({ ...song, title: e.target.value })}
            placeholder="Song Title"
          />
          <input
            className="sheetor-artist-input"
            value={song.artist}
            onChange={(e) => setSong({ ...song, artist: e.target.value })}
            placeholder="Artist"
          />
        </div>

        <dl className="selection-readout">
          <div className="readout-chip">
            <dt>Measure</dt>
            <dd>{activeMeasureIndex + 1} / {song.measures.length}</dd>
          </div>
          <div className="readout-chip">
            <dt>Beat</dt>
            <dd>{activeBeatIndex + 1} / {song.measures[activeMeasureIndex]?.beats.length ?? 0}</dd>
          </div>
          <div className="readout-chip">
            <dt>String</dt>
            <dd>{activeStringIndex + 1} · {midiToNoteName(tuning[activeStringIndex] ?? 0)}</dd>
          </div>
          <div className="readout-chip is-accent">
            <dt>Cursor</dt>
            <dd>{activeBeat?.isRest ? 'Rest' : activeNote ? `Fret ${activeNote.fret}` : 'Empty'}</dd>
          </div>
          <div className="readout-chip">
            <dt>Time</dt>
            <dd>{activeMeasureTimeSignature.numerator}/{activeMeasureTimeSignature.denominator}</dd>
          </div>
        </dl>
      </div>

      {/* Editor Canvas */}
      <div 
        className="sheetor-canvas-container"
        onClick={() => {
          // Refocus the editor on click
          containerRef.current?.focus();
        }}
      >
        <svg 
          viewBox={`-25 0 ${MAX_ROW_WIDTH + 25} ${totalSVGHeight}`}
          className="music-svg"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* Background Interactivity Catcher */}
          <rect 
            x="-25"
            width={MAX_ROW_WIDTH + 25} 
            height={totalSVGHeight} 
            fill="transparent" 
            className="svg-interactive-bg"
            onClick={() => containerRef.current?.focus()}
          />

          {/* Render Staff & Measure Lines */}
          {song.measures.map((measure, mIdx) => {
            const measureX = getMeasureX(mIdx);
            const measureW = getMeasureWidth(mIdx);
            const measureEnd = measureX + measureW;
            const isLast = mIdx === song.measures.length - 1;
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            const effectiveTimeSignature = getEffectiveTimeSignature(song, mIdx);
            const effectiveBpm = getEffectiveBpm(song, mIdx);
            const showTimingChange = mIdx === 0 || typeof measure.bpm === 'number' || !!measure.timeSignature;

            const { isValid, actual, expected } = checkMeasureBeats(measure, mIdx, (i) => getEffectiveTimeSignature(song, i));

            return (
              <g key={measure.id}>
                {/* An over/under-filled bar is flagged in the margin, never on top
                    of the notes: a hairline tint plus an amber rule and count. */}
                {!isValid && (
                  <rect
                    x={measureX}
                    y={rowY + 2}
                    width={measureW}
                    height={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX - 2 + 8}
                    fill="rgba(224, 168, 63, 0.035)"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Standard Notation 5 lines (Treble staff) */}
                {Array.from({ length: 5 }).map((_, lineIdx) => {
                  const y = rowY + 10 + lineIdx * 10;
                  return (
                    <line
                      key={`sl-${lineIdx}`}
                      x1={measureX}
                      y1={y}
                      x2={measureEnd}
                      y2={y}
                      className="staff-line"
                    />
                  );
                })}

                {/* TAB lines (TAB staff) */}
                {Array.from({ length: stringCount }).map((_, lineIdx) => {
                  const y = rowY + TAB_STAFF_TOP + ts + lineIdx * 10;
                  return (
                    <line
                      key={`tl-${lineIdx}`}
                      x1={measureX}
                      y1={y}
                      x2={measureEnd}
                      y2={y}
                      className="staff-line"
                    />
                  );
                })}

                {/* Bar line start / divider */}
                <line
                  x1={measureX}
                  y1={rowY + 10}
                  x2={measureX}
                  y2={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX - 10}
                  className="bar-line"
                />

                {/* Bar line end */}
                <line
                  x1={measureEnd}
                  y1={rowY + 10}
                  x2={measureEnd}
                  y2={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX - 10}
                  className={isLast ? "bar-line-end" : "bar-line"}
                />

                {showTimingChange && (
                  <text
                    x={measureX + 6}
                    y={rowY + 8}
                    className="music-text"
                    fontSize="10"
                    style={{ pointerEvents: 'none' }}
                  >
                    {`♩=${effectiveBpm}`}
                  </text>
                )}

                {/* Measure number */}
                <text
                  x={measureX + 4}
                  y={rowY + 9}
                  className="measure-number"
                  fontSize="8"
                  style={{ pointerEvents: 'none' }}
                >
                  {mIdx + 1}
                </text>

                {!isValid && (
                  <g>
                    <text
                      className="measure-warning-text"
                      x={measureEnd - 12}
                      y={rowY + 9}
                      fontSize="7.5"
                      textAnchor="end"
                      style={{ pointerEvents: 'none' }}
                    >
                      {actual > expected ? 'over' : 'short'} {Math.round(Math.abs(actual - expected) * 100) / 100}
                    </text>
                    <title>
                      {`Bar length mismatch: ${actual} quarter notes, expected ${expected}.`}
                    </title>
                  </g>
                )}

                {/* Clef, TAB, tuning labels (rendered on the first measure of every row) */}
                {(measureLayouts[mIdx]?.x === 0) && (
                  <g transform={`translate(${measureX}, ${rowY})`}>
                    {/* Treble Clef Path */}
                    <path
                      d="M 17.5 45 C 19 45, 21 42, 21 38 C 21 32, 17 28, 17 21 C 17 12, 21 3, 23.5 0 L 24 0 L 22.5 10 C 21.5 16, 18.5 22, 18.5 28 C 18.5 35, 23.5 38, 23.5 44 C 23.5 48.5, 20 52, 16 52 C 12.5 52, 9.5 49, 9.5 45.5 C 9.5 41, 13.5 37, 18 37 C 20.5 37, 22.5 39, 22.5 41.5 C 22.5 44, 21 45.5, 18.5 45.5 C 17 45.5, 16 44, 16 42.5 C 16 41.5, 17 40.5, 18 40.5 C 16.5 40.5, 14.5 42, 14.5 45 C 14.5 48, 17.5 50.5, 20.5 50.5 C 23.5 50.5, 25.5 48, 25.5 43 C 25.5 37.5, 20.5 33.5, 20.5 27 C 20.5 21, 23.5 15, 24.5 10 L 25 1 L 25 45 C 25 49.5, 23.5 53, 21 55 C 19.5 56, 18 56.5, 16.5 56.5 C 15 56.5, 13.5 55, 13.5 53 C 13.5 51, 15 49.5, 16.5 49.5 C 18 49.5, 19.5 51, 19.5 53 C 19.5 53.5, 19 54, 18.5 54.5 C 20 54, 21.5 51.5, 21.5 48 L 21.5 16 C 20.5 20, 19 25, 19 30 C 19 36.5, 22 41, 22 45 C 22 48.5, 20 51, 17.5 51 C 15 51, 13 49, 13 46.5 C 13 44, 15 42, 17.5 42 C 18.5 42, 19.5 42.5, 19.5 43.5 C 19.5 44.5, 18.5 45, 17.5 45 Z"
                      transform="translate(15, 5) scale(0.9)"
                      fill="#f2ece4"
                    />

                    {/* Stacked TAB text */}
                    <text x="18" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 14} className="music-text" fontSize="13" letterSpacing="0">T</text>
                    <text x="18" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 2} className="music-text" fontSize="13" letterSpacing="0">A</text>
                    <text x="18" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 18} className="music-text" fontSize="13" letterSpacing="0">B</text>

                    {/* Tuning labels to the left of the TAB text */}
                    {Array.from({ length: stringCount }).map((_, i) => {
                      const pitch = tuning[i];
                      const name = midiToNoteName(pitch);
                      return (
                        <text
                          key={i}
                          x="-8"
                          y={TAB_STAFF_TOP + ts + i * TAB_STAFF_HEIGHT_PX}
                          dominantBaseline="central"
                          fill="#a09890"
                          fontFamily="'Outfit', 'Inter', sans-serif"
                          fontSize="7"
                          fontWeight="600"
                          textAnchor="end"
                          style={{ pointerEvents: 'none' }}
                        >
                          {name}
                        </text>
                      );
                    })}

                    {/* Time Signature (first-of-row measures) */}
                    {showTimingChange && (
                      <g>
                        <text x="50" y="25" className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x="50" y="45" className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                        
                        <text x="50" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x="50" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                      </g>
                    )}
                  </g>
                )}

                {/* Big Time Signature for timing changes (non-first-of-row measures) */}
                {showTimingChange && mIdx > 0 && measureLayouts[mIdx]?.x !== 0 && (
                  <g>
                    <text x={measureX + 12} y={rowY + 25} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                    <text x={measureX + 12} y={rowY + 45} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                    <text x={measureX + 12} y={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                    <text x={measureX + 12} y={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                  </g>
                )}

                {/* Interactive transparent rectangles over the standard staff of this measure to place notes on click */}
                {measure.beats.map((b) => {
                  const beatX = getBeatCoordinates(mIdx, measure.beats.indexOf(b));
                  
                  if (viewMode) return null;
                  return (
                    <g key={`clicks-${b.id}`}>
                      {/* Clicking standard staff region triggers layout coordinate mapper */}
                      <rect
                        x={beatX - 10}
                        y={rowY}
                        width="20"
                        height="65"
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const relativeY = e.clientY - rect.top;
                          const designY = relativeY * (65 / rect.height);
                          handleStandardStaffClick(mIdx, b.id, designY);
                        }}
                      />
                      
                      {/* Clicking TAB staff region changes active beat/string */}
                      {Array.from({ length: stringCount }).map((_, stringIdx) => {
                        const y = rowY + TAB_STAFF_TOP + ts + stringIdx * 10;
                        return (
                          <rect
                            key={`click-string-${stringIdx}`}
                            x={beatX - 10}
                            y={y - 5}
                            width="20"
                            height="10"
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setActiveMeasureIndex(mIdx);
                              setActiveBeatIndex(measure.beats.indexOf(b));
                              setActiveStringIndex(stringIdx);
                              setShowNoteOptions(false);
                            }}
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Render Active Beat Highlight & Playback Cursor */}
          {song.measures.map((measure, mIdx) => {
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            return measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx);
              
              const isSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx;
              const pb = playback.playbackBeat;
              const isPlayback = pb && pb.measureIndex === mIdx && pb.beatIndex === bIdx;

              return (
                <g key={`highlight-${b.id}`}>
                  {/* Selected Cursor Highlight */}
                  {!viewMode && isSelected && (
                    <g>
                      <rect
                        x={beatX - 10}
                        y={rowY + 5}
                        width="20"
                        height={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX - 5}
                        fill="rgba(201, 119, 46, 0.12)"
                        stroke="#d98a3f"
                        strokeWidth="1.5"
                        rx="4"
                        pointerEvents="none"
                      />
                      {/* Fret/string tiny dot cursor in TAB */}
                      <circle
                        cx={beatX}
                        cy={rowY + TAB_STAFF_TOP + ts + activeStringIndex * 10}
                        r="5.5"
                        fill="transparent"
                        stroke="#e0a83f"
                        strokeWidth="1.5"
                        pointerEvents="none"
                      />
                    </g>
                  )}

                  {/* Playback Cursor (Green line) */}
                  {isPlayback && (
                    <line
                      x1={beatX}
                      y1={rowY + 2}
                      x2={beatX}
                      y2={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX}
                      stroke="#3fb98a"
                      strokeWidth="2.5"
                      strokeDasharray="2"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            });
          })}

          {/* Render Notes & Rests */}
          {song.measures.map((measure, mIdx) => {
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            const beamGroups = computeBeamGroups(measure.beats, getEffectiveTimeSignature(song, mIdx));
            return (
              <g key={`measure-${measure.id}`}>
              {measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx);
              const beamInfo = beamGroups.find(g => g.startIdx <= bIdx && bIdx <= g.endIdx);

              // 1. Rests
              if (b.isRest || b.notes.length === 0) {
                const dur = b.duration;
                return (
                  <g key={`rest-${b.id}`} transform={`translate(0, ${rowY})`}>
                    {/* Render Rest on Standard Staff */}
                    {dur === '1' && (
                      // Whole rest: hanging rectangle on line 4 (y=20)
                      <rect x={beatX - 6} y="20" width="12" height="6" fill="#f2ece4" />
                    )}
                    {dur === '2' && (
                      // Half rest: sitting rectangle on line 3 (y=30)
                      <rect x={beatX - 6} y="24" width="12" height="6" fill="#f2ece4" />
                    )}
                    {dur === '4' && (
                      // Quarter rest: classic squiggle (rendered as path)
                      <path
                        d={`M ${beatX - 1.5} ${30 - 10} l 3 3 c -1.5 1.5, -3 3, -0.75 4.5 c 1.5 1.5, 0.75 3, -2.25 4.5 c -1.5 -0.75, -2.25 -1.5, -0.75 -2.25 c 1.5 -0.75, 0.75 -1.5, 0 -2.25 c -1.5 -0.75, -1.1 -2.25, 0.75 -3.3 Z`}
                        fill="#f2ece4"
                        stroke="#f2ece4"
                        strokeWidth="1.5"
                      />
                    )}
                    {(dur === '8' || dur === '16' || dur === '32') && (
                      // Eighth / Sixteenth / Thirty-Second rest: slash with hooks
                      <g>
                        <line x1={beatX + 2} y1={22} x2={beatX - 3} y2={35} stroke="#f2ece4" strokeWidth="1.5" />
                        <circle cx={beatX - 3} cy={24} r="2.2" fill="#f2ece4" />
                        {dur === '16' && (
                          <circle cx={beatX - 5} cy={29} r="2.2" fill="#f2ece4" />
                        )}
                        {dur === '32' && (
                          <>
                            <circle cx={beatX - 5} cy={29} r="2.2" fill="#f2ece4" />
                            <circle cx={beatX - 7} cy={34} r="2.2" fill="#f2ece4" />
                          </>
                        )}
                      </g>
                    )}
                    {/* Dotted rest dot */}
                    {b.dot && (
                      <circle cx={beatX + 10} cy={dur === '1' ? 23 : dur === '2' ? 27 : 25} r="2.2" fill="#f2ece4" pointerEvents="none" />
                    )}
                  </g>
                );
              }

              // 2. Chords & Melodic Notes
              // Precalculate diatonic positions for standard staff rendering
              const calculatedNotes = b.notes.map(n => {
                const midi = tuning[n.stringIndex] + n.fret;
                const { diatonicStep, accidental } = midiToDiatonicAndAccidental(midi);
                return {
                  ...n,
                  midi,
                  step: diatonicStep,
                  accidental,
                  y: rowY + Y_of_step(diatonicStep)
                };
              });

              // Sort notes by pitch to determine stems easily (ascending order, i.e., lowest y is highest pitch)
              calculatedNotes.sort((x, y) => x.y - y.y);

              const lowestY = calculatedNotes[calculatedNotes.length - 1].y;
              const highestY = calculatedNotes[0].y;
              const avgStep = calculatedNotes.reduce((acc, curr) => acc + curr.step, 0) / calculatedNotes.length;
              
              // Stem direction: unified direction for beam groups, per-beat otherwise
              const stemUp = beamInfo ? getBeamStemUp(measure, beamInfo) : avgStep < 6;
              const isWhole = b.duration === '1';
              const hasStem = !isWhole;

              // Stem position for beaming
              const stemX = hasStem ? (stemUp ? beatX + 4 : beatX - 4) : 0;
              const rawStemY = hasStem
                ? (beamInfo
                  ? (stemUp
                    ? getBeamY(measure, beamInfo, stemUp) - 2
                    : getBeamY(measure, beamInfo, stemUp) + 2)
                  : (stemUp ? highestY - 30 : lowestY + 30))
                : 0;
              const stemEndY = rawStemY;

              return (
                <g key={`notes-${b.id}`}>
                  {/* A. Standard Notation noteheads & stems */}
                  {calculatedNotes.map((n) => {
                    const isSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx && activeStringIndex === n.stringIndex;

                    // Skip notes that would render below the TAB staff area
                    if (n.y > rowY + TAB_STAFF_TOP + ts - 8) return null;

                    return (
                      <g key={`note-${mIdx}-${bIdx}-${n.stringIndex}`}>
                        {/* Ledger Lines if note lies outside the 5-line staff */}
                        {(() => {
                          const lines = [];
                          if (n.step <= 0) {
                            const bound = n.step % 2 === 0 ? n.step : n.step + 1;
                            for (let s = 0; s >= bound; s -= 2) {
                              lines.push(s);
                            }
                          } else if (n.step >= 12) {
                            const bound = n.step % 2 === 0 ? n.step : n.step - 1;
                            for (let s = 12; s <= bound; s += 2) {
                              lines.push(s);
                            }
                          }
                          return lines.map(lineStep => {
                            const lineY = rowY + Y_of_step(lineStep);
                            return (
                              <line
                                key={`ledg-${lineStep}`}
                                x1={beatX - 7}
                                y1={lineY}
                                x2={beatX + 7}
                                y2={lineY}
                                className="staff-ledger-line"
                              />
                            );
                          });
                        })()}

                        {/* Accidental (#) if sharp */}
                        {n.accidental === '#' && (
                          <g stroke="#f2ece4" strokeWidth="1.3" opacity="0.9">
                            <line x1={beatX - 13} y1={n.y - 6} x2={beatX - 13} y2={n.y + 6} />
                            <line x1={beatX - 10} y1={n.y - 8} x2={beatX - 10} y2={n.y + 4} />
                            <line x1={beatX - 16} y1={n.y - 2.5} x2={beatX - 7} y2={n.y - 4} />
                            <line x1={beatX - 16} y1={n.y + 2.5} x2={beatX - 7} y2={n.y + 1} />
                      {!beamInfo && b.duration === '32' && (
                        <g fill="#f2ece4">
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY + 5} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY - 5} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY + 10} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY - 10} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                        </g>
                      )}
                    </g>
                  )}

                        {/* Notehead */}
                        <ellipse
                          cx={beatX}
                          cy={n.y}
                          rx="4.5"
                          ry="3.0"
                          transform={`rotate(-20 ${beatX} ${n.y})`}
                          fill={isSelected ? "#d98a3f" : (b.duration === '1' || b.duration === '2' ? "none" : "#f2ece4")}
                          stroke={isSelected ? "#d98a3f" : "#f2ece4"}
                          strokeWidth="1.4"
                          className="notehead"
                          onClick={() => {
                            selectNote(mIdx, bIdx, n.stringIndex);
                          }}
                        />
                        {/* Dotted note dot */}
                        {b.dot && (
                          <circle cx={beatX + 8} cy={n.y} r="2.2" fill="#f2ece4" pointerEvents="none" />
                        )}
                      </g>
                    );
                  })}

                  {/* Shared stem for chord */}
                  {hasStem && (
                    <g>
                      <line
                        x1={stemX}
                        y1={stemUp ? lowestY : highestY}
                        x2={stemX}
                        y2={stemEndY}
                        stroke="#f2ece4"
                        strokeWidth="1.5"
                      />

                      {/* Individual flag for ungrouped 8th/16th */}
                      {!beamInfo && b.duration === '8' && (
                        <path
                          d={stemUp 
                            ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                            : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                          }
                          fill="#f2ece4"
                        />
                      )}
                      {!beamInfo && b.duration === '16' && (
                        <g fill="#f2ece4">
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY + 5} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY - 5} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                        </g>
                      )}
                    </g>
                  )}

                  {/* B. TAB numbers (fret digits over strings) */}
                  {b.notes.map(n => {
                    const stringY = rowY + TAB_STAFF_TOP + ts + n.stringIndex * 10;
                    const isSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx && activeStringIndex === n.stringIndex;

                    const fretDisplay = (note: TabNote): string => {
                      if (note.ghostNote) return 'x';
                      let text = note.harmonic ? `<${note.fret}>` : `${note.fret}`;
                      if (note.bend) text += 'b';
                      if (note.vibrato) text += '~';
                      return text;
                    };

                    const displayText = fretDisplay(n);
                    const bgWidth = Math.max(10, displayText.length * 6 + 4);

                    return (
                      <g 
                        key={`tab-note-${mIdx}-${bIdx}-${n.stringIndex}`}
                        className={`tab-fret-container ${isSelected ? 'active-note' : ''}`}
                        onClick={() => {
                          selectNote(mIdx, bIdx, n.stringIndex);
                        }}
                      >
                        {/* Background rectangle to block staff line behind fret number */}
                        <rect
                          x={beatX - bgWidth / 2}
                          y={stringY - 4.5}
                          width={bgWidth}
                          height="9"
                          rx="2"
                          className="tab-fret-bg"
                        />
                        <text
                          x={beatX}
                          y={stringY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="tab-fret-text"
                        >
                          {displayText}
                        </text>
                        {(n.slur || n.legatoSlide) && (() => {
                          let prevPos: { x: number; y: number } | null = null;
                          for (let i = bIdx - 1; i >= 0; i--) {
                            const prevBeat = measure.beats[i];
                            const prevNote = prevBeat?.notes.find(nn => nn.stringIndex === n.stringIndex);
                            if (prevNote) {
                              prevPos = {
                                x: getBeatCoordinates(mIdx, i),
                                y: getRowY(mIdx) + TAB_STAFF_TOP + ts + n.stringIndex * 10,
                              };
                              break;
                            }
                          }
                          if (!prevPos) return null;
                          if (n.slur) {
                            const dx = beatX - prevPos.x;
                            const cy = Math.min(prevPos.y, stringY) - 6;
                            return (
                              <path
                                d={`M ${prevPos.x} ${prevPos.y - 3} C ${prevPos.x + dx * 0.35} ${cy - 6}, ${beatX - dx * 0.35} ${cy - 6}, ${beatX} ${stringY - 3}`}
                                fill="none"
                                stroke="#a89f96"
                                strokeWidth="1.2"
                                style={{ pointerEvents: 'none' }}
                              />
                            );
                          }
                          if (n.legatoSlide) {
                            return (
                              <line
                                x1={prevPos.x + 7}
                                y1={prevPos.y}
                                x2={beatX - 7}
                                y2={stringY}
                                stroke="#a89f96"
                                strokeWidth="1"
                                style={{ pointerEvents: 'none' }}
                              />
                            );
                          }
                          return null;
                        })()}
                      </g>
                    );
                  })}

                  {/* TAB rhythm stem (duration indicator below TAB staff) */}
                  {hasStem && (
                    <line
                      x1={stemUp ? beatX + 4 : beatX - 4}
                      y1={rowY + TAB_STAFF_TOP + ts + stringCount * 10 + 2}
                      x2={stemUp ? beatX + 4 : beatX - 4}
                      y2={rowY + TAB_STAFF_TOP + ts + stringCount * 10 + 2 + (beamInfo ? 11.5 : 10)}
                      stroke="#6f6862"
                      strokeWidth="1.2"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Palm mute / let ring indicators */}
                  {b.notes.some(n => n.palmMute) && (
                    <text x={beatX - 12} y={rowY + TAB_STAFF_TOP + ts - 4} className="music-text" fontSize="8" fill="#e0a83f" style={{ pointerEvents: 'none' }}>
                      P.M.
                    </text>
                  )}
                  {b.notes.some(n => n.letRing) && (
                    <text x={beatX - 12} y={rowY + TAB_STAFF_TOP + ts - 14} className="music-text" fontSize="8" fill="#3fb98a" style={{ pointerEvents: 'none' }}>
                      let ring
                    </text>
                  )}
                </g>
              );
              })}

              {/* Beams for standard notation */}
              {beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx);
                const lastX = getBeatCoordinates(mIdx, g.endIdx);
                const mainStemUp = getBeamStemUp(measure, g);
                const beamY = getBeamY(measure, g, mainStemUp);
                const beamDir = mainStemUp ? 1 : -1;
                const firstSX = mainStemUp ? firstX + 4 - 0.75 : firstX - 4 - 0.75;
                const lastSX = mainStemUp ? lastX + 4 + 0.75 : lastX - 4 + 0.75;

                // Find contiguous runs of 16th+32nd notes (secondary beam)
                const secondarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration === '8') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx) {
                    const b = measure.beats[si];
                    if (!b || b.isRest || b.notes.length === 0 || b.duration === '8') break;
                    si++;
                  }
                  const segEnd = si - 1;
                  if (segEnd >= segStart) secondarySegments.push({ start: segStart, end: segEnd });
                }

                // Find contiguous 32nd-note runs (tertiary beam)
                const tertiarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration !== '32') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx && measure.beats[si]?.duration === '32' && !(measure.beats[si]?.isRest)) si++;
                  const segEnd = si - 1;
                  if (segEnd >= segStart) tertiarySegments.push({ start: segStart, end: segEnd });
                }

                return (
                  <g key={`beam-${gi}`} style={{ pointerEvents: 'none' }}>
                    {/* Primary beam: spans the full group */}
                    <rect x={firstSX} y={beamY - 2} width={Math.max(lastSX - firstSX, 2)} height="4" fill="#f2ece4" />
                    {/* Secondary beam: over 16th+32nd runs, extended 1/4 way to adjacent 8ths */}
                    {secondarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration === '8') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration === '8') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.75 : leftX - 4 - 0.75;
                      const rightSX = mainStemUp ? rightX + 4 + 0.75 : rightX - 4 + 0.75;
                      return (
                        <rect key={`beam16-${gi}-${si}`} x={leftSX} y={beamY - 2 + beamDir * 5} width={Math.max(rightSX - leftSX, 2)} height="4" fill="#f2ece4" />
                      );
                    })}
                    {/* Tertiary beam: over 32nd runs, extended 1/4 way to adjacent 16ths/8ths */}
                    {tertiarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration !== '32') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration !== '32') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.75 : leftX - 4 - 0.75;
                      const rightSX = mainStemUp ? rightX + 4 + 0.75 : rightX - 4 + 0.75;
                      return (
                        <rect key={`beam32-${gi}-${si}`} x={leftSX} y={beamY - 2 + beamDir * 10} width={Math.max(rightSX - leftSX, 2)} height="4" fill="#f2ece4" />
                      );
                    })}
                  </g>
                );
              })}

              {/* TAB rhythm beams (connecting the stems below TAB staff) */}
              {beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx);
                const lastX = getBeatCoordinates(mIdx, g.endIdx);
                const mainStemUp = getBeamStemUp(measure, g);
                const rhythmY = rowY + TAB_STAFF_TOP + ts + stringCount * 10 + 2 + 10;
                const firstSX = mainStemUp ? firstX + 4 - 0.6 : firstX - 4 - 0.6;
                const lastSX = mainStemUp ? lastX + 4 + 0.6 : lastX - 4 + 0.6;

                // Find contiguous runs of 16th+32nd notes for secondary beam
                const secondarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration === '8') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx) {
                    const b = measure.beats[si];
                    if (!b || b.isRest || b.notes.length === 0 || b.duration === '8') break;
                    si++;
                  }
                  const segEnd = si - 1;
                  if (segEnd >= segStart) secondarySegments.push({ start: segStart, end: segEnd });
                }

                // Find contiguous 32nd-note runs for tertiary beam
                const tertiarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration !== '32') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx && measure.beats[si]?.duration === '32' && !(measure.beats[si]?.isRest)) si++;
                  const segEnd = si - 1;
                  if (segEnd >= segStart) tertiarySegments.push({ start: segStart, end: segEnd });
                }

                return (
                  <g key={`tab-beam-${gi}`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={firstSX}
                      y={rhythmY - 1.5}
                      width={Math.max(lastSX - firstSX, 2)}
                      height="3"
                      fill="#6f6862"
                    />
                    {secondarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration === '8') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration === '8') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.6 : leftX - 4 - 0.6;
                      const rightSX = mainStemUp ? rightX + 4 + 0.6 : rightX - 4 + 0.6;
                      return (
                        <rect
                          key={`tab-beam16-${gi}-${si}`}
                          x={leftSX}
                          y={rhythmY - 1.5 - 4}
                          width={Math.max(rightSX - leftSX, 2)}
                          height="3"
                          fill="#6f6862"
                        />
                      );
                    })}
                    {tertiarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration !== '32') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration !== '32') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.6 : leftX - 4 - 0.6;
                      const rightSX = mainStemUp ? rightX + 4 + 0.6 : rightX - 4 + 0.6;
                      return (
                        <rect
                          key={`tab-beam32-${gi}-${si}`}
                          x={leftSX}
                          y={rhythmY - 1.5 - 8}
                          width={Math.max(rightSX - leftSX, 2)}
                          height="3"
                          fill="#6f6862"
                        />
                      );
                    })}
                  </g>
                );
              })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Virtual Fretboard */}
      {showFretboard && (
        <div className="sheetor-fretboard">
          <div className="fretboard-header">
            <div className="fretboard-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <path d="M12 2a3 3 0 0 0-3 3v2.5c0 .5-.2 1-.6 1.4L5 12.5V16l1.5.5L5 21h14l-1.5-4.5L19 16v-3.5l-3.4-3.6c-.4-.4-.6-.9-.6-1.4V5a3 3 0 0 0-3-3Z" />
                <circle cx="8" cy="18" r="1" />
              </svg>
              Fretboard
            </div>
            <span className="fretboard-title" style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)', fontWeight: 500 }}>
              Click a fret to place a note on the selected beat
            </span>
          </div>

          <div className="fretboard-neck-container" style={{ height: `${fretboardNeckHeight}px` }}>
            {/* The Nut */}
            <div className="fretboard-nut" />

            {/* Fret marker dots on standard positions (3, 5, 7, 9, 12, 15) */}
            {[3, 5, 7, 9, 12, 15].map((fret) => {
              const leftPos = getFretLeftPercentage(fret - 1) + (getFretLeftPercentage(fret) - getFretLeftPercentage(fret - 1)) / 2;
              
              if (fret === 12) {
                // Double dots
                return (
                  <React.Fragment key={`mark-${fret}`}>
                    <div className="fretboard-marker double-1" style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }} />
                    <div className="fretboard-marker double-2" style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }} />
                  </React.Fragment>
                );
              }
              // Single dot
              return (
                <div 
                  key={`mark-${fret}`}
                  className="fretboard-marker single" 
                  style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }} 
                />
              );
            })}

            {/* Nickel Frets vertical bars */}
            {Array.from({ length: fretCount }).map((_, idx) => {
              const fretNum = idx + 1;
              const leftPos = getFretLeftPercentage(fretNum);
              return (
                <div 
                  key={`fret-${fretNum}`}
                  className="fretboard-fret-line"
                  style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }}
                />
              );
            })}

            {/* Horizontal Strings (rendered with scaling thicknesses) */}
            {Array.from({ length: stringCount }).map((_, stringIdx) => {
              const y = getFretboardStringY(stringIdx);
              const thickness = 1.0 + ((stringCount - 1) - stringIdx) * (2.5 / Math.max(stringCount - 1, 1));
              
              return (
                <div 
                  key={`fb-str-${stringIdx}`}
                  className="fretboard-string"
                  style={{ 
                    top: `${y}px`, 
                    height: `${thickness}px`,
                    opacity: 0.85
                  }}
                />
              );
            })}

            {/* Clickable fretboard note triggers & glowing bubbles */}
            {Array.from({ length: stringCount }).map((_, stringIdx) => {
              const stringY = getFretboardStringY(stringIdx);

              return Array.from({ length: fretCount + 1 }).map((_, fretNum) => {
                const leftPct = getFretCellLeft(fretNum);
                const widthPct = getFretCellWidth(fretNum);

                // Note name on this coordinate
                const noteMidi = tuning[stringIdx] + fretNum;
                const noteName = midiToNoteName(noteMidi);

                // Check if this fret is currently selected in the active beat
                const isSelectedNote = activeBeat && activeBeat.notes.some(
                  n => n.stringIndex === stringIdx && n.fret === fretNum
                );

                // Check if playback cursor is currently playing this note
                let isPlaybackNote = false;
                const pb = playback.playbackBeat;
                if (pb) {
                  const pbBeatObj = song.measures[pb.measureIndex]?.beats[pb.beatIndex];
                  isPlaybackNote = pbBeatObj ? pbBeatObj.notes.some(
                    n => n.stringIndex === stringIdx && n.fret === fretNum && !pbBeatObj.isRest
                  ) : false;
                }

                return (
                  <div
                    key={`cell-${stringIdx}-${fretNum}`}
                    className="fretboard-fret-cell"
                    style={{
                      top: `${stringY - 12}px`,
                      left: fretNum === 0 ? '0px' : `calc(30px + (100% - 30px) * ${leftPct / 100})`,
                      width: fretNum === 0 ? '30px' : `calc((100% - 30px) * ${widthPct / 100})`,
                      height: '25px',
                    }}
                    onClick={() => {
                      if (isSelectedNote) {
                        // Toggle it off
                        removeActiveNoteOnString(stringIdx);
                        setShowNoteOptions(false);
                      } else {
                        // Select it
                        setFretForActiveNote(stringIdx, fretNum);
                        setShowNoteOptions(false);
                      }
                    }}
                  >
                    <div className={`fretboard-note-bubble ${isSelectedNote ? 'active' : ''} ${isPlaybackNote ? 'playback-active' : ''}`}>
                      {fretNum === 0 ? `0 (${noteName})` : noteName}
                    </div>
                  </div>
                );
              });
            })}
          </div>

          {/* Fret Numbers Header bottom row */}
          <div className="fret-labels">
            {Array.from({ length: fretCount + 1 }).map((_, fretNum) => {
              const widthPct = getFretCellWidth(fretNum);
              return (
                <div 
                  key={`fret-lbl-${fretNum}`}
                  className="fret-label"
                  style={{
                    width: fretNum === 0 ? '30px' : `calc((100% - 30px) * ${widthPct / 100})`,
                  }}
                >
                  {fretNum === 0 ? 'Nut' : fretNum}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNoteOptions && (
        <div className="note-options-overlay" onClick={() => setShowNoteOptions(false)}>
        <div className="note-options-panel" onClick={(e) => e.stopPropagation()}>
          <div className="note-options-summary">
            <strong>
              {activeNote ? `String ${activeStringIndex + 1}, fret ${activeNote.fret}` : `Beat ${activeBeatIndex + 1}`}
            </strong>
            <span>{activeBeat?.isRest ? 'Rest' : `${selectedNotes.length} note${selectedNotes.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="duration-selector">{durationButtons}{dotButton}</div>
          {activeNote && (
            <div className="technique-row">
              <button
                className={`technique-btn ${activeNote?.harmonic ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('harmonic')}
                title="Harmonic"
              >&lt;/&gt;</button>
              <button
                className={`technique-btn ${activeNote?.palmMute ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('palmMute')}
                title="Palm mute"
              >P.M.</button>
              <button
                className={`technique-btn ${activeNote?.letRing ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('letRing')}
                title="Let ring"
              >Ring</button>
              <button
                className={`technique-btn ${activeNote?.vibrato ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('vibrato')}
                title="Vibrato"
              >~~</button>
              <button
                className={`technique-btn ${activeNote?.ghostNote ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('ghostNote')}
                title="Ghost note"
              >(x)</button>
              <button
                className={`technique-btn ${activeNote?.slur ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('slur')}
                title="Slur (hammer-on/pull-off)"
              >⌢</button>
              <button
                className={`technique-btn ${activeNote?.legatoSlide ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('legatoSlide')}
                title="Legato slide"
              >╱</button>
              <button
                className={`technique-btn ${activeNote?.bend ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('bend')}
                title="Bend"
              >b</button>
            </div>
          )}
          <button className="btn" onClick={toggleActiveBeatRest}>
            {activeBeat?.isRest ? 'Make playable' : 'Make rest'}
          </button>
          <button className="btn btn-danger" onClick={() => {
            removeActiveNoteOnString(activeStringIndex);
            setShowNoteOptions(false);
          }}>
            Remove note
          </button>
          <button className="btn" onClick={() => setShowNoteOptions(false)}>Close</button>
        </div>
        </div>
      )}

      <div className="bottom-command-bar">
        {/* Transport: everything that affects playback */}
        <div className="bottom-cluster">
          {playback.isPlaying ? (
            <button className="btn btn-danger" onClick={playback.stop}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startPlaybackFromCursor}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          )}
          <label className="transport-field">
            <span>BPM</span>
            <input
              type="number"
              className="control-input"
              value={activeMeasureBpm}
              onChange={(e) => setActiveMeasureBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
            />
          </label>
          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'speed' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'speed' ? null : 'speed')}
              title="Playback speed"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {playbackSpeed}x
            </button>
            {openBottomMenu === 'speed' && (
              <div className="bottom-popover" style={{ left: 0, right: 'auto', minWidth: 176 }}>
                <span className="popover-title">Speed</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      className={`btn ${playbackSpeed === speed ? 'btn-active' : ''}`}
                      onClick={() => setPlaybackSpeed(speed)}
                      style={{ flex: 1, minWidth: 48 }}
                    >{speed}x</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            className={`btn ${loopPlayback ? 'btn-active' : ''}`}
            onClick={() => setLoopPlayback(prev => !prev)}
            title="Loop playback"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Loop
          </button>
        </div>

        <div className="cmd-spacer" />

        <div className="bottom-cluster">
          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'song' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'song' ? null : 'song')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 3H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
                <path d="M19 3h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
                <path d="M9 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" />
                <path d="M19 13h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" />
              </svg>
              Song
            </button>
            {openBottomMenu === 'song' && (
              <div className="bottom-popover">
              <span className="popover-title">Measure {activeMeasureIndex + 1}</span>
              <div className="control-group">
                <span className="control-label">Sig</span>
                <select
                  className="control-select"
                  value={activeMeasureTimeSignature.numerator}
                  onChange={(e) => {
                    const num = parseInt(e.target.value) || 4;
                    setActiveMeasureTimeSignature('numerator', num);
                  }}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 12].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>/</span>
                <select
                  className="control-select"
                  value={activeMeasureTimeSignature.denominator}
                  onChange={(e) => {
                    const den = parseInt(e.target.value) || 4;
                    setActiveMeasureTimeSignature('denominator', den);
                  }}
                >
                  {[2, 4, 8, 16].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="popover-divider" />
              <span className="popover-title">Song file</span>
              <button className="btn" onClick={handleExport}>Share JSON</button>
              <button className="btn" onClick={handleImport}>Load JSON</button>
              <div className="popover-divider" />
              <button className="btn btn-danger" onClick={clearSong}>Clear song</button>
            </div>
            )}
          </div>

          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'edit' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'edit' ? null : 'edit')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              Edit
            </button>
            {openBottomMenu === 'edit' && (
              <div className="bottom-popover">
              <span className="popover-title">Beat {activeBeatIndex + 1}</span>
              <button className="btn btn-primary" onClick={insertBeatAfterActive}>Insert beat</button>
              <button className="btn btn-danger" onClick={deleteActiveBeat}>Delete beat</button>
              <div className="popover-divider" />
              <span className="popover-title">Measure {activeMeasureIndex + 1}</span>
              <button className="btn" onClick={addMeasure}>Add measure</button>
              <button className="btn" onClick={insertMeasureAfterActive}>Insert measure</button>
              <button className="btn" onClick={duplicateActiveMeasure}>Duplicate measure</button>
              <button className="btn btn-danger" onClick={deleteActiveMeasure}>Delete measure</button>
            </div>
            )}
          </div>

          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'tuning' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'tuning' ? null : 'tuning')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="4" x2="20" y2="20" />
                <path d="M9 4.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5Z" />
                <path d="M4 12a8 8 0 0 1 16 0" />
                <path d="M7 12a5 5 0 0 1 10 0" />
                <path d="M10 12a2 2 0 0 1 4 0" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              Tuning
            </button>
            {openBottomMenu === 'tuning' && (
              <div className="bottom-popover" style={{ minWidth: 220, right: 'auto', left: 0 }}>
                <label className="compact-field wide-field">
                  <span>Preset</span>
                  <select
                    className="control-select"
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const pitches = STANDARD_TUNINGS[val];
                      if (pitches) {
                        setTuning(pitches);
                        setActiveStringIndex(prev => Math.min(prev, pitches.length - 1));
                        setSong(prev => pruneNotesToStringCount(prev, pitches.length));
                      }
                    }}
                  >
                    <option value="">-- Select --</option>
                    {TUNING_PRESETS.map(([name]) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="compact-field wide-field">
                  <span>Strings</span>
                  <select
                    className="control-select"
                    value={stringCount}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 6;
                      setTuning(prev => {
                        if (prev.length === count) return prev;
                        if (prev.length < count) {
                          return [...prev, ...allStringPitches.slice(prev.length, count)];
                        }
                        return prev.slice(0, count);
                      });
                      setActiveStringIndex(prev => Math.min(prev, count - 1));
                      setSong(prev => pruneNotesToStringCount(prev, count));
                    }}
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <div className="popover-divider" />
                <span className="popover-title">Per string</span>
                {tuning.map((pitch, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="control-label" style={{ width: 12, textAlign: 'right' }}>{i + 1}</span>
                    <select
                      className="control-select"
                      style={{ flex: 1, fontSize: '0.75rem' }}
                      value={midiToNoteOctave(pitch)}
                      onChange={(e) => {
                        const newMidi = noteOctaveToMidi(e.target.value);
                        if (newMidi > 0) {
                          setTuning(prev => {
                            const next = [...prev];
                            next[i] = newMidi;
                            return next;
                          });
                        }
                      }}
                    >
                      {GUITAR_NOTE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'sound' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'sound' ? null : 'sound')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              Sound
            </button>
            {openBottomMenu === 'sound' && (
              <div className="bottom-popover">
              <label className="compact-field wide-field">
                <span>Type</span>
                <select
                  className="control-select"
                  value={synthType}
                  onChange={(e) => setSynthType(e.target.value)}
                >
                  <option value="guitar">Plucked Guitar</option>
                  <option value="sine">Sine Wave</option>
                  <option value="triangle">Triangle Wave</option>
                  <option value="square">Square Wave</option>
                  <option value="sawtooth">Saw Wave</option>
                </select>
              </label>
              <label className="compact-field wide-field">
                <span>Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                />
              </label>
            </div>
            )}
          </div>

          <div className="cmd-divider" />

          <button className="btn" onClick={() => {
            setViewMode(prev => {
              if (!prev) {
                setShowNoteOptions(false);
                setOpenBottomMenu(null);
              }
              return !prev;
            });
          }} title={viewMode ? 'Back to editing' : 'Read-only view'}>
            {viewMode ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Edit
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                View
              </>
            )}
          </button>
          <button
            className={`btn ${showFretboard ? 'btn-active' : ''}`}
            onClick={() => setShowFretboard(prev => !prev)}
            title={showFretboard ? 'Hide the fretboard' : 'Show the fretboard'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Neck
          </button>
          <button className="btn" onClick={() => {
            setOpenBottomMenu(null);
            setShowShortcuts(true);
          }} title="Keyboard shortcuts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Keys
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className="shortcut-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcut-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shortcut-panel-header">
              <strong>Keyboard</strong>
              <button className="btn" onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
            <div className="shortcut-button-grid">
              <span><kbd>←</kbd><kbd>→</kbd> Beat</span>
              <span><kbd>↑</kbd><kbd>↓</kbd> String</span>
              <span><kbd>0</kbd>-<kbd>9</kbd> Fret</span>
              <span><kbd>Delete</kbd> Remove</span>
              <span><kbd>Space</kbd> Play</span>
              <span><kbd>R</kbd> Rest</span>
              <span><kbd>+</kbd><kbd>-</kbd> Duration</span>
              <span className="shortcut-divider">Note techniques</span>
              <span><kbd>H</kbd> Slur</span>
              <span><kbd>S</kbd> Legato slide</span>
              <span><kbd>V</kbd> Vibrato</span>
              <span><kbd>B</kbd> Bend</span>
              <span><kbd>M</kbd> Palm mute</span>
              <span><kbd>L</kbd> Let ring</span>
              <span><kbd>O</kbd> Harmonic</span>
              <span><kbd>G</kbd> Ghost note</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Import/Export */}
      {modalOpen && (
        <div className="sheetor-modal-backdrop" onClick={() => setModalOpen(null)}>
          <div className="sheetor-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheetor-modal-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  {modalOpen === 'export' ? (
                    <>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </>
                  ) : (
                    <>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </>
                  )}
                </svg>
                {modalOpen === 'export' ? 'Export Song JSON' : 'Import Song JSON'}
              </span>
              <button className="sheetor-modal-close" onClick={() => setModalOpen(null)}>&times;</button>
            </h3>
            
            <p className="sheetor-modal-desc">
              {modalOpen === 'export' 
                ? 'Copy this JSON representation to share your song, or download it as a file.'
                : 'Paste a song JSON representation here and click load.'}
            </p>

            <textarea
              className="sheetor-modal-textarea"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              readOnly={modalOpen === 'export'}
              placeholder='{ "title": "My Song", ... }'
            />

            {modalStatus && (
              <div className="sheetor-modal-status">{modalStatus}</div>
            )}

            <div className="sheetor-modal-footer">
              {modalOpen === 'export' ? (
                <>
                  <button className="btn" onClick={copyToClipboard}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Code
                  </button>
                  <button className="btn btn-primary" onClick={downloadJsonFile}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download File
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={executeImport}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Load Song
                </button>
              )}
              <button className="btn" onClick={() => setModalOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabSheetEditor;
