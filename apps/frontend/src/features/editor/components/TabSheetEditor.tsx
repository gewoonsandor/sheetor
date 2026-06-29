import React, { useState, useEffect, useRef } from 'react';
import './TabSheetEditor.css';

import type { TabNote, TabBeat, TabMeasure, TabSong, MLayout } from './types';
import {
  getStringPitches,
  getDurationVal,
  getBeatDurationInSeconds,
  computeBeamGroups,
  midiToNoteName,
  midiToDiatonicAndAccidental,
  Y_of_step,
  createEmptyMeasure,
} from './songUtils';
import { createGuitarBuffer } from './audioEngine';
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
  TAB_STAFF_TOP,
  TAB_STAFF_HEIGHT_PX,
} from './layout';



export const TabSheetEditor: React.FC = () => {
  // --- STATE ---
  const [song, setSong] = useState<TabSong>({
    title: "New Sketch",
    artist: "Unknown Artist",
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    measures: [createEmptyMeasure()]
  });
  const [activeMeasureIndex, setActiveMeasureIndex] = useState<number>(0);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [activeStringIndex, setActiveStringIndex] = useState<number>(0);
  const [stringCount, setStringCount] = useState<number>(6);

  // Derived string pitches based on current string count
  const guitarStringPitches = getStringPitches(stringCount);
  
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackBeat, setPlaybackBeat] = useState<{ measureIndex: number; beatIndex: number } | null>(null);
  
  const [durationSelect, setDurationSelect] = useState<'1' | '2' | '4' | '8' | '16'>('4');
  const [dotSelect, setDotSelect] = useState<boolean>(false);
  const [synthType, setSynthType] = useState<string>('guitar');
  const [volume, setVolume] = useState<number>(0.8);
  const [showFretboard, setShowFretboard] = useState<boolean>(true);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showNoteOptions, setShowNoteOptions] = useState<boolean>(false);
  const [openBottomMenu, setOpenBottomMenu] = useState<'song' | 'edit' | 'sound' | null>(null);

  // Import/Export Modal state
  const [modalOpen, setModalOpen] = useState<'import' | 'export' | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<string>('');

  // Refs for audio scheduling
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const activeMeasureIndexRef = useRef<number>(0);
  const activeBeatIndexRef = useRef<number>(0);
  const nextBeatTimeRef = useRef<number>(0);
  const timerIdRef = useRef<number | null>(null);

  // Keyboard navigation & double-digit entry ref
  const lastKeyTimeRef = useRef<number>(0);
  const lastKeyStringRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync refs to state changes for playback
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Clean up playback on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const playBeat = (beat: TabBeat, time: number, bpm: number) => {
    if (beat.isRest || beat.notes.length === 0) return;
    
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, time);
    masterGain.connect(ctx.destination);
    
    beat.notes.forEach(note => {
      const midi = guitarStringPitches[note.stringIndex] + note.fret;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const duration = getBeatDurationInSeconds(beat.duration, beat.dot, bpm);
      
      if (synthType === 'guitar') {
        const buffer = createGuitarBuffer(ctx, freq, duration + 0.5); // Add sustain window
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(masterGain);
        source.start(time);
      } else {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = synthType as OscillatorType;
        osc.frequency.setValueAtTime(freq, time);
        
        // ADSR Envelope
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(0.2, time + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.01);
        
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        
        osc.start(time);
        osc.stop(time + duration);
      }
    });
  };

  // Lookahead Scheduler
  const startPlayback = () => {
    if (isPlaying) return;
    
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    setIsPlaying(true);
    isPlayingRef.current = true;
    
    // Resume from selected index, or start if out of bounds
    let mIdx = activeMeasureIndex;
    let bIdx = activeBeatIndex;
    if (mIdx >= song.measures.length || bIdx >= (song.measures[mIdx]?.beats.length || 0)) {
      mIdx = 0;
      bIdx = 0;
    }
    
    activeMeasureIndexRef.current = mIdx;
    activeBeatIndexRef.current = bIdx;
    nextBeatTimeRef.current = ctx.currentTime + 0.05;
    
    setPlaybackBeat({ measureIndex: mIdx, beatIndex: bIdx });
    
    const scheduleAhead = () => {
      if (!isPlayingRef.current || !ctx) return;
      
      const lookahead = 0.1; // 100ms
      const now = ctx.currentTime;
      
      while (nextBeatTimeRef.current < now + lookahead) {
        const currentM = activeMeasureIndexRef.current;
        const currentB = activeBeatIndexRef.current;
        
        const measure = song.measures[currentM];
        if (!measure) {
          stopPlayback();
          return;
        }
        
        const beat = measure.beats[currentB];
        if (!beat) {
          // Move to next measure if we overflow beats
          activeMeasureIndexRef.current++;
          activeBeatIndexRef.current = 0;
          continue;
        }
        
        const currentBpm = getEffectiveBpm(currentM);
        playBeat(beat, nextBeatTimeRef.current, currentBpm);
        
        // Sync UI visual cursor
        const schedTime = nextBeatTimeRef.current;
        setTimeout(() => {
          if (isPlayingRef.current) {
            setPlaybackBeat({ measureIndex: currentM, beatIndex: currentB });
            setActiveMeasureIndex(currentM);
            setActiveBeatIndex(currentB);
          }
        }, Math.max(0, (schedTime - ctx.currentTime) * 1000));
        
        const dur = getBeatDurationInSeconds(beat.duration, beat.dot, currentBpm);
        nextBeatTimeRef.current += dur;
        
        activeBeatIndexRef.current++;
        if (activeBeatIndexRef.current >= measure.beats.length) {
          activeBeatIndexRef.current = 0;
          activeMeasureIndexRef.current++;
        }
      }
      
      timerIdRef.current = requestAnimationFrame(scheduleAhead);
    };
    
    timerIdRef.current = requestAnimationFrame(scheduleAhead);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (timerIdRef.current) {
      cancelAnimationFrame(timerIdRef.current);
      timerIdRef.current = null;
    }
    setPlaybackBeat(null);
  };

  // Play a single pitch helper (for virtual fretboard/click feedbacks)
  const triggerSingleTone = (midi: number) => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const time = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume * 0.7, time);
    masterGain.connect(ctx.destination);
    
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const duration = 0.8;
    
    if (synthType === 'guitar') {
      const buffer = createGuitarBuffer(ctx, freq, duration);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGain);
      source.start(time);
    } else {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = synthType as OscillatorType;
      osc.frequency.setValueAtTime(freq, time);
      
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.2, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.02);
      
      osc.connect(gainNode);
      gainNode.connect(masterGain);
      
      osc.start(time);
      osc.stop(time + duration);
    }
  };

  // --- STATE EDITORS ---

  const getActiveBeat = (): TabBeat | undefined => {
    return song.measures[activeMeasureIndex]?.beats[activeBeatIndex];
  };

  const getEffectiveBpm = (measureIndex: number): number => {
    for (let i = measureIndex; i >= 0; i--) {
      const bpm = song.measures[i]?.bpm;
      if (typeof bpm === 'number') return bpm;
    }
    return song.bpm;
  };

  const getEffectiveTimeSignature = (measureIndex: number) => {
    for (let i = measureIndex; i >= 0; i--) {
      const timeSignature = song.measures[i]?.timeSignature;
      if (timeSignature) return timeSignature;
    }
    return song.timeSignature;
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
        const midi = guitarStringPitches[stringIndex] + fret;
        triggerSingleTone(midi);
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

  const setDurationForActiveBeat = (dur: '1' | '2' | '4' | '8' | '16') => {
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
          id: Math.random().toString(36).substring(2, 9),
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
    
    const copy: TabMeasure = {
      id: Math.random().toString(36).substring(2, 9),
      beats: currentM.beats.map(b => ({
        ...b,
        id: Math.random().toString(36).substring(2, 9),
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
    stopPlayback();
    setSong({
      title: "New Sketch",
      artist: "Unknown Artist",
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      measures: [createEmptyMeasure()]
    });
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
        const timeSignature = getEffectiveTimeSignature(activeMeasureIndex);
        const targetDur = timeSignature.numerator * (4 / timeSignature.denominator);

        if (activeBeatIndex < measure.beats.length - 1) {
          setActiveBeatIndex(prev => prev + 1);
        } else {
          // On the last beat of the measure
          if (measureDur < targetDur - 0.001) {
            // Bar is not filled yet, create a new beat with same length
            const prevDuration = beat ? beat.duration : durationSelect;
            const newBeat: TabBeat = {
              id: Math.random().toString(36).substring(2, 9),
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
              id: Math.random().toString(36).substring(2, 9),
              beats: [{
                id: Math.random().toString(36).substring(2, 9),
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
        if (isPlaying) {
          stopPlayback();
        } else {
          startPlayback();
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
        const durOrder: ('1' | '2' | '4' | '8' | '16')[] = ['16', '8', '4', '2', '1'];
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
        const durOrder: ('1' | '2' | '4' | '8' | '16')[] = ['16', '8', '4', '2', '1'];
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

  // Focus the container so it captures keys immediately
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, [activeBeatIndex, activeMeasureIndex]);

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

  const getMeasureWidth = (index: number): number => measureLayouts[index]?.width ?? 0;
  const getMeasurePadding = (index: number): number => measureLayouts[index]?.padding ?? 18;
  const getRowY = (index: number): number => (measureLayouts[index]?.row ?? 0) * ROW_HEIGHT;
  const getMeasureX = (index: number): number => measureLayouts[index]?.x ?? 0;

  const rowCount = (measureLayouts.length > 0 ? Math.max(...measureLayouts.map(l => l.row)) : 0) + 1;
  const totalSVGHeight = rowCount * ROW_HEIGHT + 10;
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

    // Calculate sum of beat values to scale incomplete measures
    let totalDur = 0;
    const beatOffsets: number[] = [];
    measure.beats.forEach((b) => {
      beatOffsets.push(totalDur);
      totalDur += getDurationVal(b.duration, b.dot);
    });

    const timeSignature = getEffectiveTimeSignature(mIdx);
    const targetMeasureDuration = timeSignature.numerator * (4 / timeSignature.denominator);
    const denom = Math.max(totalDur, targetMeasureDuration);

    const startOffset = beatOffsets[bIdx] || 0;
    return measureX + padding + (startOffset / denom) * usableWidth;
  };

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
      const baseMidi = guitarStringPitches[s];
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
    navigator.clipboard.writeText(jsonText);
    setModalStatus('JSON copied to clipboard!');
    setTimeout(() => setModalStatus(''), 2000);
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
    try {
      const parsed = JSON.parse(jsonText) as TabSong;
      if (!parsed.title || !parsed.measures || !Array.isArray(parsed.measures)) {
        throw new Error("Missing required song fields (title, measures).");
      }
      // Simple validation
      parsed.measures.forEach(m => {
        if (!m.id || !m.beats || !Array.isArray(m.beats)) {
          throw new Error("Invalid measure format: each measure must contain an ID and beats array.");
        }
      });
      
      setSong(parsed);
      setActiveMeasureIndex(0);
      setActiveBeatIndex(0);
      setModalOpen(null);
    } catch (err: any) {
      setModalStatus(`Error: ${err.message || 'Invalid JSON format'}`);
    }
  };



  // --- RENDER HELPERS ---

  const activeBeat = getActiveBeat();
  const selectedNotes = activeBeat?.notes ?? [];
  const activeNote = selectedNotes.find(n => n.stringIndex === activeStringIndex);
  const activeMeasureBpm = getEffectiveBpm(activeMeasureIndex);
  const activeMeasureTimeSignature = getEffectiveTimeSignature(activeMeasureIndex);

  const selectNote = (mIdx: number, bIdx: number, stringIdx: number) => {
    const wasSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx && activeStringIndex === stringIdx;
    setActiveMeasureIndex(mIdx);
    setActiveBeatIndex(bIdx);
    setActiveStringIndex(stringIdx);
    setShowNoteOptions(wasSelected);
  };

  const durationButtons = (['1', '2', '4', '8', '16'] as const).map((dur) => (
    <button
      key={dur}
      className={`duration-btn ${durationSelect === dur ? 'active' : ''}`}
      onClick={() => {
        setDurationSelect(dur);
        setDurationForActiveBeat(dur);
      }}
      title={`Set note length: ${dur === '1' ? 'Whole' : dur === '2' ? 'Half' : dur === '4' ? 'Quarter' : dur === '8' ? 'Eighth' : 'Sixteenth'}`}
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
      <span className="duration-label">
        {dur === '1' ? '1/1' : dur === '2' ? '1/2' : dur === '4' ? '1/4' : dur === '8' ? '1/8' : '1/16'}
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

        <div className="sheetor-controls">
          {/* Playback Controls */}
          {isPlaying ? (
            <button className="btn btn-danger" onClick={stopPlayback}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startPlayback}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          )}

          {/* Tempo & Volume */}
          <div className="control-group">
            <span className="control-label">BPM</span>
            <input
              type="number"
              className="control-input"
              value={activeMeasureBpm}
              onChange={(e) => setActiveMeasureBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
            />
          </div>

          <div className="control-group">
            <span className="control-label">Sig</span>
            <select
              className="control-select"
              style={{ padding: '2px 4px', width: '42px', textAlign: 'center' }}
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
            <span style={{ color: '#64748b' }}>/</span>
            <select
              className="control-select"
              style={{ padding: '2px 4px', width: '42px', textAlign: 'center' }}
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

          <div className="control-group">
            <span className="control-label">Strings</span>
            <select
              className="control-select"
              style={{ padding: '2px 4px', width: '48px', textAlign: 'center' }}
              value={stringCount}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 6;
                setStringCount(count);
                setActiveStringIndex(prev => Math.min(prev, count - 1));
              }}
            >
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <span className="control-label">Sound</span>
            <select
              className="control-select"
              value={synthType}
              onChange={(e) => setSynthType(e.target.value)}
            >
              <option value="guitar">🎸 Plucked Guitar</option>
              <option value="sine">🔔 Sine Wave</option>
              <option value="triangle">📐 Triangle Wave</option>
              <option value="square">⬜ Square Wave</option>
              <option value="sawtooth">🪚 Saw Wave</option>
            </select>
          </div>

          <div className="control-group">
            <span className="control-label">Vol</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              style={{ width: '70px', accentColor: '#6366f1' }}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>

          <button className="btn" onClick={handleExport}>📤 Share</button>
          <button className="btn" onClick={handleImport}>📥 Load</button>
        </div>

        <div className="selection-readout">
          <span>M{activeMeasureIndex + 1}</span>
          <span>B{activeBeatIndex + 1}</span>
          <span>S{activeStringIndex + 1}</span>
          <span>{activeBeat?.isRest ? 'Rest' : activeNote ? `F${activeNote.fret}` : 'Empty'}</span>
        </div>
      </div>

      {/* Toolbar / Song Actions */}
      <div className="sheetor-toolbar">
        <div className="toolbar-section">
          <span className="control-label" style={{ marginRight: '6px' }}>Duration:</span>
          <div className="duration-selector">
            {(['1', '2', '4', '8', '16'] as const).map((dur) => (
              <button
                key={dur}
                className={`duration-btn ${durationSelect === dur ? 'active' : ''}`}
                onClick={() => {
                  setDurationSelect(dur);
                  setDurationForActiveBeat(dur);
                }}
                title={`Set note length: ${dur === '1' ? 'Whole' : dur === '2' ? 'Half' : dur === '4' ? 'Quarter' : dur === '8' ? 'Eighth' : 'Sixteenth'}`}
              >
                {/* Custom Notehead SVGs for duration */}
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
                <span className="duration-label">
                  {dur === '1' ? '1/1' : dur === '2' ? '1/2' : dur === '4' ? '1/4' : dur === '8' ? '1/8' : '1/16'}
                </span>
              </button>
            ))}
          </div>

          <button
            className={`btn ${(activeBeat?.dot ?? dotSelect) ? 'active' : ''}`}
            onClick={() => {
              toggleDotForActiveBeat();
            }}
            style={{ height: '44px', minWidth: '36px' }}
            title="Dotted note"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <circle cx="18" cy="18" r="3" />
              <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
              <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </button>

          <button className="btn" onClick={toggleActiveBeatRest} style={{ height: '44px' }}>
            ∅ {activeBeat?.isRest ? 'Set Playable' : 'Set Rest'}
          </button>
        </div>

        <div className="toolbar-section">
          {/* Add / Insert / Delete Beats & Measures */}
          <button className="btn btn-primary" onClick={insertBeatAfterActive} title="Insert empty beat after current cursor">
            ➕ Beat
          </button>
          <button className="btn btn-danger" onClick={deleteActiveBeat} title="Delete active beat">
            🗑️ Beat
          </button>
          
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />

          <button className="btn" onClick={addMeasure} title="Append measure to end">
            ➕ Measure
          </button>
          <button className="btn" onClick={insertMeasureAfterActive} title="Insert empty measure after selected measure">
            ➕ Insert M.
          </button>
          <button className="btn" onClick={duplicateActiveMeasure} title="Copy selected measure to next slot">
            👥 Duplicate M.
          </button>
          <button className="btn btn-danger" onClick={deleteActiveMeasure} title="Delete selected measure">
            🗑️ Measure
          </button>
        </div>

        <div className="toolbar-section">
          <button className="btn btn-danger" onClick={clearSong}>Clear</button>
        </div>
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
          viewBox={`0 0 ${MAX_ROW_WIDTH} ${totalSVGHeight}`}
          className="music-svg"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* Background Interactivity Catcher */}
          <rect 
            width={MAX_ROW_WIDTH} 
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
            const effectiveTimeSignature = getEffectiveTimeSignature(mIdx);
            const effectiveBpm = getEffectiveBpm(mIdx);
            const showTimingChange = mIdx === 0 || typeof measure.bpm === 'number' || !!measure.timeSignature;

            const { isValid, actual, expected } = checkMeasureBeats(measure, mIdx, getEffectiveTimeSignature);

            return (
              <g key={measure.id}>
                {/* Subtle warning highlight behind measure if invalid */}
                {!isValid && (
                  <rect
                    x={measureX}
                    y={rowY + 2}
                    width={measureW}
                    height={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX - 2 + 8}
                    fill="rgba(239, 68, 68, 0.03)"
                    stroke="rgba(239, 68, 68, 0.15)"
                    strokeWidth="1"
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
                  const y = rowY + 90 + lineIdx * 10;
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
                  y2={rowY + TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX - 10}
                  className="bar-line"
                  stroke={!isValid ? "#ef4444" : undefined}
                  strokeWidth={!isValid ? 1.5 : undefined}
                />

                {/* Bar line end */}
                <line
                  x1={measureEnd}
                  y1={rowY + 10}
                  x2={measureEnd}
                  y2={rowY + TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX - 10}
                  className={isLast ? "bar-line-end" : "bar-line"}
                  stroke={!isValid ? "#ef4444" : undefined}
                  strokeWidth={!isValid ? (isLast ? 3 : 1.5) : undefined}
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

                {/* Warning Badge if time signature mismatch */}
                {!isValid && (
                  <g>
                    <circle
                      cx={measureEnd - 16}
                      cy={rowY + 18}
                      r="6"
                      fill="#ef4444"
                    />
                    <text
                      x={measureEnd - 16}
                      y={rowY + 18}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none' }}
                    >
                      !
                    </text>
                    <title>
                      {`Measure duration mismatch! Got ${actual} beats (quarter notes), expected ${expected}.`}
                    </title>
                  </g>
                )}

                {/* Clef, TAB (rendered on the first measure of every row) */}
                {(measureLayouts[mIdx]?.x === 0) && (
                  <g transform={`translate(${measureX}, ${rowY})`}>
                    {/* Treble Clef Path */}
                    <path
                      d="M 17.5 45 C 19 45, 21 42, 21 38 C 21 32, 17 28, 17 21 C 17 12, 21 3, 23.5 0 L 24 0 L 22.5 10 C 21.5 16, 18.5 22, 18.5 28 C 18.5 35, 23.5 38, 23.5 44 C 23.5 48.5, 20 52, 16 52 C 12.5 52, 9.5 49, 9.5 45.5 C 9.5 41, 13.5 37, 18 37 C 20.5 37, 22.5 39, 22.5 41.5 C 22.5 44, 21 45.5, 18.5 45.5 C 17 45.5, 16 44, 16 42.5 C 16 41.5, 17 40.5, 18 40.5 C 16.5 40.5, 14.5 42, 14.5 45 C 14.5 48, 17.5 50.5, 20.5 50.5 C 23.5 50.5, 25.5 48, 25.5 43 C 25.5 37.5, 20.5 33.5, 20.5 27 C 20.5 21, 23.5 15, 24.5 10 L 25 1 L 25 45 C 25 49.5, 23.5 53, 21 55 C 19.5 56, 18 56.5, 16.5 56.5 C 15 56.5, 13.5 55, 13.5 53 C 13.5 51, 15 49.5, 16.5 49.5 C 18 49.5, 19.5 51, 19.5 53 C 19.5 53.5, 19 54, 18.5 54.5 C 20 54, 21.5 51.5, 21.5 48 L 21.5 16 C 20.5 20, 19 25, 19 30 C 19 36.5, 22 41, 22 45 C 22 48.5, 20 51, 17.5 51 C 15 51, 13 49, 13 46.5 C 13 44, 15 42, 17.5 42 C 18.5 42, 19.5 42.5, 19.5 43.5 C 19.5 44.5, 18.5 45, 17.5 45 Z"
                      transform="translate(15, 5) scale(0.9)"
                      fill="#6366f1"
                    />

                    {/* Stacked TAB text */}
                    {/* Center TAB text vertically in the tab staff */}
                    <text x="18" y={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 14} className="music-text" fontSize="13" letterSpacing="0">T</text>
                    <text x="18" y={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 2} className="music-text" fontSize="13" letterSpacing="0">A</text>
                    <text x="18" y={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 18} className="music-text" fontSize="13" letterSpacing="0">B</text>

                    {/* Time Signature (first-of-row measures) */}
                    {showTimingChange && (
                      <g>
                        <text x="50" y="25" className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x="50" y="45" className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                        
                        <text x="50" y={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x="50" y={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                      </g>
                    )}
                  </g>
                )}

                {/* Big Time Signature for timing changes (non-first-of-row measures) */}
                {showTimingChange && mIdx > 0 && measureLayouts[mIdx]?.x !== 0 && (
                  <g>
                    <text x={measureX + 12} y={rowY + 25} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                    <text x={measureX + 12} y={rowY + 45} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                    <text x={measureX + 12} y={rowY + TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                    <text x={measureX + 12} y={rowY + TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                  </g>
                )}

                {/* Interactive transparent rectangles over the standard staff of this measure to place notes on click */}
                {measure.beats.map((b) => {
                  const beatX = getBeatCoordinates(mIdx, measure.beats.indexOf(b));
                  
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
                        const y = rowY + TAB_STAFF_TOP + stringIdx * 10;
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
            return measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx);
              
              const isSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx;
              const isPlayback = playbackBeat && playbackBeat.measureIndex === mIdx && playbackBeat.beatIndex === bIdx;

              return (
                <g key={`highlight-${b.id}`}>
                  {/* Selected Cursor Highlight */}
                  {isSelected && (
                    <g>
                      <rect
                        x={beatX - 10}
                        y={rowY + 5}
                        width="20"
                        height={TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX - 5}
                        fill="rgba(99, 102, 241, 0.12)"
                        stroke="#6366f1"
                        strokeWidth="1.5"
                        rx="4"
                        pointerEvents="none"
                      />
                      {/* Fret/string tiny dot cursor in TAB */}
                      <circle
                        cx={beatX}
                        cy={rowY + TAB_STAFF_TOP + activeStringIndex * 10}
                        r="5.5"
                        fill="transparent"
                        stroke="#f59e0b"
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
                      y2={rowY + TAB_STAFF_TOP + stringCount * TAB_STAFF_HEIGHT_PX}
                      stroke="#10b981"
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
            const beamGroups = computeBeamGroups(measure.beats);
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
                      <rect x={beatX - 6} y="20" width="12" height="6" fill="#f8fafc" />
                    )}
                    {dur === '2' && (
                      // Half rest: sitting rectangle on line 3 (y=30)
                      <rect x={beatX - 6} y="24" width="12" height="6" fill="#f8fafc" />
                    )}
                    {dur === '4' && (
                      // Quarter rest: classic squiggle (rendered as path)
                      <path
                        d={`M ${beatX - 1.5} ${30 - 10} l 3 3 c -1.5 1.5, -3 3, -0.75 4.5 c 1.5 1.5, 0.75 3, -2.25 4.5 c -1.5 -0.75, -2.25 -1.5, -0.75 -2.25 c 1.5 -0.75, 0.75 -1.5, 0 -2.25 c -1.5 -0.75, -1.1 -2.25, 0.75 -3.3 Z`}
                        fill="#f8fafc"
                        stroke="#f8fafc"
                        strokeWidth="1.5"
                      />
                    )}
                    {(dur === '8' || dur === '16') && (
                      // Eighth / Sixteenth rest: slash with hooks
                      <g>
                        <line x1={beatX + 2} y1={22} x2={beatX - 3} y2={35} stroke="#f8fafc" strokeWidth="1.5" />
                        <circle cx={beatX - 3} cy={24} r="2.2" fill="#f8fafc" />
                        {dur === '16' && (
                          <circle cx={beatX - 5} cy={29} r="2.2" fill="#f8fafc" />
                        )}
                      </g>
                    )}
                    {/* Dotted rest dot */}
                    {b.dot && (
                      <circle cx={beatX + 10} cy={dur === '1' ? 23 : dur === '2' ? 27 : 25} r="2.2" fill="#f8fafc" pointerEvents="none" />
                    )}
                  </g>
                );
              }

              // 2. Chords & Melodic Notes
              // Precalculate diatonic positions for standard staff rendering
              const calculatedNotes = b.notes.map(n => {
                const midi = guitarStringPitches[n.stringIndex] + n.fret;
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
              
              // Stem direction: if average step is below middle line (step 6, B4), stem goes UP.
              const stemUp = avgStep < 6;
              const isWhole = b.duration === '1';
              const hasStem = !isWhole;

              // Stem position for beaming
              const stemX = hasStem ? (stemUp ? beatX + 4 : beatX - 4) : 0;
              const stemEndY = hasStem ? (stemUp ? highestY - 25 : lowestY + 25) : 0;

              return (
                <g key={`notes-${b.id}`}>
                  {/* A. Standard Notation noteheads & stems */}
                  {calculatedNotes.map((n) => {
                    const isSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx && activeStringIndex === n.stringIndex;

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
                          <g stroke="#f8fafc" strokeWidth="1.3" opacity="0.9">
                            <line x1={beatX - 13} y1={n.y - 6} x2={beatX - 13} y2={n.y + 6} />
                            <line x1={beatX - 10} y1={n.y - 8} x2={beatX - 10} y2={n.y + 4} />
                            <line x1={beatX - 16} y1={n.y - 2.5} x2={beatX - 7} y2={n.y - 4} />
                            <line x1={beatX - 16} y1={n.y + 2.5} x2={beatX - 7} y2={n.y + 1} />
                          </g>
                        )}

                        {/* Notehead */}
                        <ellipse
                          cx={beatX}
                          cy={n.y}
                          rx="4.5"
                          ry="3.0"
                          transform={`rotate(-20 ${beatX} ${n.y})`}
                          fill={isSelected ? "#818cf8" : (b.duration === '1' || b.duration === '2' ? "none" : "#f8fafc")}
                          stroke={isSelected ? "#818cf8" : "#f8fafc"}
                          strokeWidth="1.4"
                          className="notehead"
                          onClick={() => {
                            selectNote(mIdx, bIdx, n.stringIndex);
                          }}
                        />
                        {/* Dotted note dot */}
                        {b.dot && (
                          <circle cx={beatX + 8} cy={n.y} r="2.2" fill="#f8fafc" pointerEvents="none" />
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
                        stroke="#f8fafc"
                        strokeWidth="1.5"
                      />

                      {/* Individual flag for ungrouped 8th/16th */}
                      {!beamInfo && b.duration === '8' && (
                        <path
                          d={stemUp 
                            ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                            : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                          }
                          fill="#f8fafc"
                        />
                      )}
                      {!beamInfo && b.duration === '16' && (
                        <g fill="#f8fafc">
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
                    const stringY = rowY + TAB_STAFF_TOP + n.stringIndex * 10;
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
                                y: getRowY(mIdx) + TAB_STAFF_TOP + n.stringIndex * 10,
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
                                stroke="#94a3b8"
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
                                stroke="#94a3b8"
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
                      y1={rowY + TAB_STAFF_TOP + stringCount * 10 + 2}
                      x2={stemUp ? beatX + 4 : beatX - 4}
                      y2={rowY + TAB_STAFF_TOP + stringCount * 10 + 2 + 10}
                      stroke="#64748b"
                      strokeWidth="1.2"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Palm mute / let ring indicators */}
                  {b.notes.some(n => n.palmMute) && (
                    <text x={beatX - 12} y={rowY + TAB_STAFF_TOP - 4} className="music-text" fontSize="8" fill="#f59e0b" style={{ pointerEvents: 'none' }}>
                      P.M.
                    </text>
                  )}
                  {b.notes.some(n => n.letRing) && (
                    <text x={beatX - 12} y={rowY + TAB_STAFF_TOP - 14} className="music-text" fontSize="8" fill="#10b981" style={{ pointerEvents: 'none' }}>
                      let ring
                    </text>
                  )}
                </g>
              );
              })}

              {/* Beams for standard notation (8th/16th groups) */}
              {beamGroups.map((g, gi) => {
                const firstBeat = measure.beats[g.startIdx];
                const lastBeat = measure.beats[g.endIdx];
                const firstX = getBeatCoordinates(mIdx, g.startIdx);
                const lastX = getBeatCoordinates(mIdx, g.endIdx);

                const firstNotes = firstBeat?.notes.map(n => {
                  const midi = guitarStringPitches[n.stringIndex] + n.fret;
                  const { diatonicStep } = midiToDiatonicAndAccidental(midi);
                  return { ...n, step: diatonicStep, y: rowY + Y_of_step(diatonicStep) };
                }).sort((a, b) => a.y - b.y) || [];
                const lastNotes = lastBeat?.notes.map(n => {
                  const midi = guitarStringPitches[n.stringIndex] + n.fret;
                  const { diatonicStep } = midiToDiatonicAndAccidental(midi);
                  return { ...n, step: diatonicStep, y: rowY + Y_of_step(diatonicStep) };
                }).sort((a, b) => a.y - b.y) || [];

                const firstStemUp = (firstNotes.reduce((s, n) => s + n.step, 0) / Math.max(firstNotes.length, 1)) < 6;
                const lastStemUp = (lastNotes.reduce((s, n) => s + n.step, 0) / Math.max(lastNotes.length, 1)) < 6;
                const mainStemUp = firstStemUp;

                const beamY = mainStemUp
                  ? Math.min(
                      firstStemUp ? (firstNotes[0]?.y || 0) - 30 : (firstNotes[firstNotes.length - 1]?.y || 0) + 30,
                      lastStemUp ? (lastNotes[0]?.y || 0) - 30 : (lastNotes[lastNotes.length - 1]?.y || 0) + 30
                    )
                  : Math.max(
                      firstStemUp ? (firstNotes[0]?.y || 0) - 30 : (firstNotes[firstNotes.length - 1]?.y || 0) + 30,
                      lastStemUp ? (lastNotes[0]?.y || 0) - 30 : (lastNotes[lastNotes.length - 1]?.y || 0) + 30
                    );

                const firstSX = mainStemUp ? firstX + 5.3 : firstX - 5.3;
                const lastSX = mainStemUp ? lastX + 5.3 : lastX - 5.3;

                return (
                  <g key={`beam-${gi}`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={firstSX}
                      y={beamY - 2.5}
                      width={Math.max(lastSX - firstSX, 2)}
                      height="5"
                      fill="#f8fafc"
                    />
                    {g.duration === '16' && (
                      <rect
                        x={firstSX}
                        y={beamY - 2.5 + 6}
                        width={Math.max(lastSX - firstSX, 2)}
                        height="5"
                        fill="#f8fafc"
                      />
                    )}
                  </g>
                );
              })}

              {/* TAB rhythm beams (connecting the stems below TAB staff) */}
              {beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx);
                const lastX = getBeatCoordinates(mIdx, g.endIdx);
                const rhythmY = rowY + TAB_STAFF_TOP + stringCount * 10 + 2 + 10;
                const firstSX = firstX + 5.3;
                const lastSX = lastX + 5.3;

                return (
                  <g key={`tab-beam-${gi}`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={firstSX}
                      y={rhythmY - 1.5}
                      width={Math.max(lastSX - firstSX, 2)}
                      height="3"
                      fill="#64748b"
                    />
                    {g.duration === '16' && (
                      <rect
                        x={firstSX}
                        y={rhythmY - 1.5 + 4}
                        width={Math.max(lastSX - firstSX, 2)}
                        height="3"
                        fill="#64748b"
                      />
                    )}
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
              <span>🎸</span> Interactive Fretboard Visualizer
            </div>
            <button className="btn" onClick={() => setShowFretboard(false)}>Hide Neck</button>
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
                const noteMidi = guitarStringPitches[stringIdx] + fretNum;
                const noteName = midiToNoteName(noteMidi);

                // Check if this fret is currently selected in the active beat
                const isSelectedNote = activeBeat && activeBeat.notes.some(
                  n => n.stringIndex === stringIdx && n.fret === fretNum
                );

                // Check if playback cursor is currently playing this note
                let isPlaybackNote = false;
                if (playbackBeat) {
                  const pbBeatObj = song.measures[playbackBeat.measureIndex]?.beats[playbackBeat.beatIndex];
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

      {/* Footer info panels */}
      <div className="sheetor-footer">
        {/* Keyboard Cheatsheet */}
        <div className="footer-panel">
          <div className="footer-panel-title">🎹 Keyboard Shortcuts</div>
          <div className="keyboard-grid">
            <div className="keyboard-shortcut">
              <span>Change Beat</span>
              <span className="key-tag">← / →</span>
            </div>
            <div className="keyboard-shortcut">
              <span>Change String</span>
              <span className="key-tag">↑ / ↓</span>
            </div>
            <div className="keyboard-shortcut">
              <span>Input Fret</span>
              <span className="key-tag">0 - 9</span>
            </div>
            <div className="keyboard-shortcut">
              <span>Remove Note</span>
              <span className="key-tag">Delete</span>
            </div>
            <div className="keyboard-shortcut">
              <span>Play / Pause</span>
              <span className="key-tag">Spacebar</span>
            </div>
            <div className="keyboard-shortcut">
              <span>Toggle Rest</span>
              <span className="key-tag">R</span>
            </div>
            <div className="keyboard-shortcut">
              <span>Change Duration</span>
              <span className="key-tag">+ / -</span>
            </div>
          </div>
        </div>

        {/* Selected Beat Inspector */}
        <div className="footer-panel">
          <div className="footer-panel-title">🔍 Selected Note Inspector</div>
          <div className="inspector-stats">
            <div className="stat-box">
              <span className="stat-val">{activeMeasureIndex + 1}</span>
              <span className="stat-lbl">Measure</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{activeBeatIndex + 1}</span>
              <span className="stat-lbl">Beat</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">
                {activeBeat?.isRest ? 'Rest' : (activeBeat?.notes.length ? `${activeBeat.notes.length} Note(s)` : 'Empty')}
              </span>
              <span className="stat-lbl">Status</span>
            </div>
          </div>

          <div style={{ marginTop: '14px', fontSize: '0.85rem', color: '#94a3b8' }}>
            {activeBeat && activeBeat.notes.length > 0 ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <strong>Active Notes:</strong>
                {activeBeat.notes.map((n, i) => {
                  const midi = guitarStringPitches[n.stringIndex] + n.fret;
                  return (
                    <span key={i} style={{ background: '#1e293b', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      String {n.stringIndex + 1} (Fret {n.fret}) &rarr; <strong>{midiToNoteName(midi)} ({midi})</strong>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div>No notes on active beat. Click on the Treble clef or TAB strings to add notes.</div>
            )}
          </div>
        </div>
      </div>

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
        <div className="bottom-cluster transport-cluster">
          {isPlaying ? (
            <button className="btn btn-danger" onClick={stopPlayback}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startPlayback}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          )}
          <label className="compact-field">
            <span>BPM</span>
            <input
              type="number"
              className="control-input"
              value={activeMeasureBpm}
              onChange={(e) => setActiveMeasureBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
            />
          </label>
          <label className="compact-field">
            <span>Strings</span>
            <select
              className="control-select"
              value={stringCount}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 6;
                setStringCount(count);
                setActiveStringIndex(prev => Math.min(prev, count - 1));
              }}
            >
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="bottom-cluster">
          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'song' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'song' ? null : 'song')}
            >
              Song
            </button>
            {openBottomMenu === 'song' && (
              <div className="bottom-popover">
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
              <button className="btn" onClick={handleExport}>Share</button>
              <button className="btn" onClick={handleImport}>Load</button>
              <button className="btn btn-danger" onClick={clearSong}>Clear</button>
            </div>
            )}
          </div>

          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'edit' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'edit' ? null : 'edit')}
            >
              Edit
            </button>
            {openBottomMenu === 'edit' && (
              <div className="bottom-popover">
              <button className="btn btn-primary" onClick={insertBeatAfterActive}>Insert beat</button>
              <button className="btn btn-danger" onClick={deleteActiveBeat}>Delete beat</button>
              <button className="btn" onClick={addMeasure}>Add measure</button>
              <button className="btn" onClick={insertMeasureAfterActive}>Insert measure</button>
              <button className="btn" onClick={duplicateActiveMeasure}>Duplicate measure</button>
              <button className="btn btn-danger" onClick={deleteActiveMeasure}>Delete measure</button>
            </div>
            )}
          </div>

          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'sound' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'sound' ? null : 'sound')}
            >
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

          <button className="btn" onClick={() => setShowFretboard(prev => !prev)}>
            {showFretboard ? 'Hide neck' : 'Show neck'}
          </button>
          <button className="btn" onClick={() => {
            setOpenBottomMenu(null);
            setShowShortcuts(true);
          }}>Keys</button>
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

      {/* Glassmorphism Import/Export Modals */}
      {modalOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setModalOpen(null)}
        >
          <div 
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '24px',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '600px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: '1.25rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>{modalOpen === 'export' ? '📤 Export Song JSON' : '📥 Import Song JSON'}</span>
              <button 
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.5rem', padding: 0 }}
                onClick={() => setModalOpen(null)}
              >
                &times;
              </button>
            </h3>
            
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              {modalOpen === 'export' 
                ? 'Copy this JSON representation to share your song, or download it as a file.'
                : 'Paste a song JSON representation here and click load.'}
            </p>

            <textarea
              style={{
                width: '100%',
                height: '240px',
                background: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#34d399',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box'
              }}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              readOnly={modalOpen === 'export'}
              placeholder='{ "title": "My Song", ... }'
            />

            {modalStatus && (
              <div style={{ marginTop: '12px', color: '#818cf8', fontWeight: 'bold', fontSize: '0.9rem' }}>
                {modalStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              {modalOpen === 'export' ? (
                <>
                  <button className="btn" onClick={copyToClipboard}>📋 Copy Code</button>
                  <button className="btn btn-primary" onClick={downloadJsonFile}>💾 Download File</button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={executeImport}>⚡ Load Song</button>
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
