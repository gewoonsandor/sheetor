import { useEffect, useEffectEvent, useState } from 'react';

export type MidiKey =
  /** `chord`: another key was still held, so this one joins it. */
  | { type: 'press'; note: number; chord: boolean }
  /** The last held key went up. */
  | { type: 'release' };

/** Reads one MIDI message against the keys held so far, and updates them. */
export const readMidiKey = (held: Set<number>, data: ArrayLike<number>): MidiKey | null => {
  const kind = data[0] & 0xf0;
  const note = data[1];
  if (kind === 0x90 && data[2] > 0) {
    const chord = held.size > 0;
    held.add(note);
    return { type: 'press', note, chord };
  }
  // A note-on with velocity 0 is how most keyboards send a note-off.
  if ((kind === 0x80 || kind === 0x90) && held.delete(note) && held.size === 0) {
    return { type: 'release' };
  }
  return null;
};

export const midiSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

/** Connected input names, `'denied'`, or null while off or waiting for permission. */
export type MidiDevices = string[] | 'denied' | null;

/** Listens to every MIDI input while `enabled`, including ones plugged in later. */
export const useMidiInput = (
  enabled: boolean,
  onPress: (note: number, chord: boolean) => void,
  onRelease: () => void,
): MidiDevices => {
  const [devices, setDevices] = useState<MidiDevices>(null);
  const press = useEffectEvent(onPress);
  const release = useEffectEvent(onRelease);

  useEffect(() => {
    if (!enabled || !midiSupported()) return;
    let access: MIDIAccess | null = null;
    let closed = false;
    const held = new Set<number>();

    const onMessage = (e: MIDIMessageEvent) => {
      const key = e.data && readMidiKey(held, e.data);
      if (key?.type === 'press') press(key.note, key.chord);
      else if (key) release();
    };
    const listen = () => {
      const inputs = [...(access?.inputs.values() ?? [])];
      for (const input of inputs) input.onmidimessage = onMessage;
      setDevices(inputs.filter(i => i.state === 'connected').map(i => i.name ?? 'MIDI device'));
    };

    navigator.requestMIDIAccess().then(
      granted => {
        if (closed) return;
        access = granted;
        granted.onstatechange = listen;
        listen();
      },
      () => {
        if (!closed) setDevices('denied');
      },
    );

    return () => {
      closed = true;
      if (!access) return;
      access.onstatechange = null;
      // Close the ports: on Windows an open MIDI input is not available to other programs.
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
        void input.close();
      }
    };
  }, [enabled]);

  return enabled ? devices : null;
};
