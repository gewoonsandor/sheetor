# Changelog

Every notable change to Sheetor, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). While the version starts with `0.`, a minor release may
still change the song format or the API; from `1.0.0` on, only a major release will.

## [Unreleased]

### Added

- Your theme and colour style are saved to your account and follow you to every browser you sign
  in from.

### Changed

- Secondary text has more contrast in both themes, and every control shows a ring when it has
  keyboard focus.
- Menus and dialogs work from the keyboard: opening one moves focus into it, and Escape closes it
  and returns focus to where it was.

## [1.0.0] - 2026-10-01

The first release.

### Added

- Standard notation and guitar TAB on one score. Each track picks its instrument, tuning and key,
  and any staff can be in treble or bass clef and change clef at any bar.
- Grand staff for piano and other pitched instruments: one part with a right and a left hand, each
  with its own rhythm.
- Techniques: hammer-on and pull-off, slides, bends, vibrato, harmonics, ghost notes, and palm mute
  and let ring marked per run.
- Playback in the browser with tempo and metre changes per bar, repeat signs, loop and speed, and a
  plucked-string synth for guitars.
- Note entry from an on-screen fretboard or piano, the computer keyboard, or a MIDI keyboard.
- Copy, cut and paste of beats and bars, within a song or into another one, and undo and redo of
  your own edits.
- A library on the server with nested folders, drag-and-drop filing and duplicates.
- Folder sharing with viewer and editor roles.
- Real-time co-editing with presence and live cursors.
- Email-and-password accounts and single sign-on through any OpenID Connect provider.
- One Docker image serving the app, the API, live sessions and the API docs; it needs PostgreSQL.
