# Changelog

Every notable change to Sheetor, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). While the version starts with `0.`, a minor release may
still change the song format or the API; from `1.0.0` on, only a major release will.

## [Unreleased]

### Added

- Your theme and colour style are saved to your account and follow you to every browser you sign
  in from.
- Paper score, in the editor's View menu: dark ink on a light page, in the dark theme too. It is
  saved to your account with the rest of your appearance.
- The Sheetor logo in the header and on the sign-in screen, and app icons for browser tabs, home
  screens and installs. The logo and the tab icon take the colour of your colour style, with a
  version for each theme.
- An Emerald colour style that matches the logo, now the default. Anyone who already has a colour
  style keeps it until they pick Emerald in Settings.
- Bends have a size. B steps the note through a ½ bend, a full bend and none, and Shift+B lets the
  bend back down (a release). The TAB labels the size and draws the release, and the notation
  curves to the pitch the bend reaches. Bends in songs saved earlier read as full.
- Slides into a note from below or above, and out of a note down or up. S steps the slide into a
  note: from the note before, from below, from above, off. Shift+S steps the slide out: down, up,
  off. A note can have both.
- Triplets and sextuplets. T steps the beat under the cursor through a triplet, a sextuplet and
  neither, and the next beat you add keeps it, so a run of triplets types straight on. The score
  shows the count over each group, on a bracket when the notes are not beamed together, and
  playback plays them in time.
- D deletes the same way Delete does: the note under the cursor, a rest beat, or the selection.
- Clicking a clef or a time signature in the score opens the Measure menu on that bar, where both
  are set. A clef takes the click anywhere in a box a little larger than it, not just on its ink.
- The score shows every repeat's play count, ×2 included, and clicking it edits it right there,
  like a tempo mark. Clicking a repeat sign opens the Measure menu on its bar.
- A repeat with no end is marked "no end" in the score, and the Measure menu warns about it.
- The Measure menu shows the play count of the repeated section the cursor is in, from any bar of
  it, not only from the bar that ends it.

### Changed

- Repeats belong to each part instead of the whole song, so one instrument can repeat while
  another plays on. Songs saved before keep their repeats on the first track only.
- A track that is not a guitar or bass leaves out what only a string can do: harmonics, palm
  mute, bends and slides are gone from its note toolbar and their keys do nothing, and a guitar
  part turned into another instrument drops them.
- Vibrato is a wavy line over the note, in the notation and above the TAB, and a bend is an arrow
  rising from the fret number instead of a `~` or `b` after the fret.
- Secondary text has more contrast in both themes, and every control shows a ring when it has
  keyboard focus.
- Menus and dialogs work from the keyboard: opening one moves focus into it, and Escape closes it
  and returns focus to where it was.
- The editor's song title, artist and presence share one line, and a note toolbar above the score
  holds note length, rest, techniques and MIDI input. The panel that opened on a second click on a
  note is gone.
- The command bar shows where the cursor is, and measure commands have a Measure menu of their
  own. Clearing a song asks first.
- A read-only song can still be played, walked with the arrow keys and copied from.
- `?` opens the keyboard shortcuts, which now list every key.
- On phones and tablets the score reflows to the screen's width instead of scrolling sideways, and
  on a touch screen every control grows to a finger's size.
- The library is a list: search finds songs in every folder, songs sort by title or by last edit,
  and each row has a ⋯ menu for its actions. A whole row opens its song.
- In read-only mode the song title and artist can no longer be clicked into, and Escape leaves
  either field and returns to the score.
- The TAB cursor is drawn in your colour style instead of yellow, and only on an empty string: on a
  note, the note's own highlight is the only ring. The beat's outline widens to fit a harmonic's
  `<12>`.
- The command bar has undo and redo buttons and a one-click Read-only toggle at its far right, next
  to the Song menu. The Edit menu is gone: inserting and deleting a beat moved to the Measure menu,
  and copy, cut and paste stay on Ctrl+C, X and V.
- I inserts a beat after the cursor and Shift+I a bar; Shift+Delete deletes the beat and
  Ctrl+Delete the bar. The Measure menu shows each key.
- Grand staff is a toggle in Track settings instead of the View menu, which now shows the staff
  choice only for guitar and bass.
- A notes staff has a cursor like the TAB's: ↑ and ↓ move a circle line by line, Enter writes a
  note there, and the note on the circle is the one techniques, Delete and Shift+↑/↓ act on.
- The fretboard and the piano keys are one Tab stop each; the arrow keys move between frets and
  strings, or keys, inside. Tab out of an open menu closes it.
- Staff and bar lines, the selected TAB fret, a muted track and the amber style's buttons have more
  contrast, and on a touch screen small buttons, sliders, fret rows and piano keys are full
  finger size.
- On a phone, the command bar's menus fit the screen.
- With reduced motion turned on, the score jumps to the cursor instead of scrolling smoothly.

### Fixed

- The editor froze on a bar where an eighth or shorter note crosses a beat, for example an eighth
  starting on the last sixteenth of a beat.
- A slur or a slide into a note connects only to a note on the same string in the beat right before
  it, not across a rest or a beat on other strings.
- Note techniques that cannot go together (ghost note with harmonic, bend or vibrato; a slur with a
  slide into the note; palm mute with let ring in one beat) are greyed out instead of combined.
- A menu closes when you click anywhere outside it, not only inside the command bar, and that
  click still does what it was aimed at.
- A digit typed quickly after moving to another note no longer joins the fret typed before it: 2,
  →, 2 writes two 2s, not a 22. Any other key also ends a two-digit fret.
- A slur or a slide into a note now connects to the note before it in the previous bar too, and
  one that crosses a row break is drawn in two halves.
- The song title and artist fields could not be clicked in Chrome and other Chromium browsers:
  opening a song scrolled them under the header, and a click on them opened the editor again
  instead.
- Bends, vibrato and palm mute or let ring over the TAB no longer run into each other. A vibrato
  or a P.M. line moves up only where a bend or another mark under it would otherwise cross it.
- Focus no longer falls to the page after closing a menu, the keyboard shortcuts, the Clear song
  confirmation or the fretboard and keyboard panel, or after a − or + reaches its limit.
- Screen readers name every track, mute, solo, tuning and technique control, and announce cursor
  moves and import status.
- Bar numbers, tempo marks and repeat counts sit above the highest note, stem, beam and ledger
  line in their row instead of running into them, and a repeat count keeps clear of the next bar's
  number.
- Focus rings inside menus, the note toolbar, the track strip and the in-score tempo box are drawn
  inside the control, so the edge of the menu no longer cuts them off. The score itself no longer
  shows a ring.
- The Grand staff toggle in Track settings looks like a button, in a Staff row lined up with the
  fields around it, instead of a line of menu text.
- Both tempo fields show their whole focus ring: the transport's no longer runs under its − and +
  buttons, and the box that opens on a tempo mark in the score is drawn over the notes and bars
  around it, keeps clear of the top of the score, and sits on the mark's line instead of dropping
  below it.
- Palm mute and let ring show on a staff without a TAB, under the notes, instead of nowhere.

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
