# BruceBlocks

A Tetris clone written as a single-file JavaScript app for [Bruce firmware](https://bruce.computer)
(Flipper-Zero-style multi-tool firmware for ESP32 devices), targeting the
M5Stack Cardputer ADV.

## What this is

`BruceBlocks.js` is a self-contained Bruce JS app: no build step, no
dependencies beyond Bruce's own `display`/`keyboard`/`audio` globals. Drop it
on the SD card and run it from Bruce's JS interpreter menu.

- **Layout:** landscape 240×135, a 10×20 well (6 px cells) centered
  horizontally with a score/lines/level/high-score panel on the left and a
  next-piece preview on the right.
- **Features:** 7-bag randomizer, ghost piece, next-piece preview, soft/hard
  drop, DAS-style auto-repeat on left/right, a 300 ms non-resetting lock
  delay, and a line-clear flash.
- **Not included, by design:** hold piece, wall kicks/SRS (a rotation that's
  blocked simply fails — this is a deliberate simplicity choice, not a bug),
  and persistent high scores (there is no storage API on this platform; the
  high score resets when the app exits).

## Controls

| Key | Action |
|---|---|
| `,` / `/` | move left / right (holds auto-repeat) |
| `;` | rotate clockwise |
| `.` | soft drop (holds auto-repeat) |
| Space | hard drop |
| Enter | pause / confirm menu selection |
| Esc | quit to the Bruce menu |

## Deploying

Copy `BruceBlocks.js` (or `min/BruceBlocks.js` — see below) onto the SD
card's `/BruceJS/` directory, then launch it from Bruce's JS interpreter
menu. They're interchangeable; both behave identically.

## Files

- `BruceBlocks.js` — readable, commented source (~17.6 KB, 551 lines).
- `min/BruceBlocks.js` — the same file with `//` comments, blank lines, and
  leading indentation stripped (~13 KB, 492 lines). **Not real
  minification** — identifiers and structure are untouched, so behavior is
  identical. Regenerate after every edit to the full file with:

  ```bash
  cd BruceBlocks
  node -e '
  const fs = require("fs");
  function transform(src) {
    return src.split("\n")
      .map(line => line.replace(/^\s+/, ""))
      .filter(line => line.length > 0 && !line.startsWith("//"))
      .join("\n") + "\n";
  }
  fs.writeFileSync("min/BruceBlocks.js", transform(fs.readFileSync("BruceBlocks.js", "utf8")));
  '
  ```

  Nothing enforces this automatically — a stale `min/` copy is a real risk
  after an edit.

## Why it's built this way

The device (Cardputer ADV) has **no PSRAM and ~125 KB of free heap** after
firmware, WiFi stack, and framebuffer. Script *source size* is loaded into
heap before the interpreter allocates anything for it — a 92 KB script (the
stock bundled "Arcade Games" app, see `../arcade-split/`) silently bounces
back to the Bruce menu instead of running. The proven-safe envelope from that
project's six split-out games is roughly 12–30 KB; this file sits at 17.6 KB
(13 KB minified), comfortably inside it.

The bigger constraint in practice is the **API surface**, which is
deliberately tiny:

```js
var display = require('display');   // fill, drawFillRect, drawRect, drawString, setTextColor, setTextSize
var keyboardApi = require('keyboard'); // getKeysPressed(), getEscPress()
```

That's the entire display API — no `drawPixel`/`drawLine`, no size query,
and critically **no double-buffering or flush call**: every draw hits the
panel immediately. `audio.tone(freq, ms)` and `delay`/`now` are bare
globals, no `require` needed. The JS engine is **strict ES5** — no `let`,
`const`, arrow functions, template literals, classes, or `for...of`.

### The rendering approach

Because there's no double-buffering, naively clearing and redrawing the well
every frame flickers. BruceBlocks tracks the well as three parallel
200-element arrays:

- `board` — locked blocks (0 = empty, else a color).
- `frame` — the desired composite this frame (board + ghost + active piece).
- `shadow` — what's *actually* lit on the physical panel right now.

Each frame, `renderWell()` rebuilds `frame` from scratch, then walks all 200
cells and repaints only the ones where `frame[i] !== shadow[i]`. This means:
moving or rotating the active piece never needs explicit "erase the old
position" logic (a vacated cell's `frame` value reverts to `board`'s value
and gets painted over automatically), locking a piece is a literal
display no-op (it was already drawn in that exact color), and the ghost
piece needs no erase logic at all. The whole render pass is gated behind a
`wellDirty` flag so it only runs when something actually moved.

The one exception to "only `renderWell()` draws inside the well" is the
line-clear flash (a white bar painted immediately on lock, before the rows
are actually removed) — `finishClear()` explicitly invalidates just the
flashed rows' `shadow` entries afterward to repair the desync.

### Gotchas worth not rediscovering

- `keyboardApi.getKeysPressed()` is **level-triggered** (fires every call
  while a key is held), not edge-triggered. Rotate, hard drop, and pause
  all track the previous frame's held state manually to fire once per press.
  Left/right/soft-drop are deliberately *not* edge-detected — they use a
  DAS-style (delayed auto-shift) timer instead.
- `getEscPress()` is edge-safe **and consuming** — call it exactly once per
  frame, at the very top of input handling.
- Cardputer arrow keys report as their printed punctuation: `;`=up, `.`=down,
  `,`=left, `/`=right (confirmed against Bruce's firmware source and its own
  Snake example). Space's reported string wasn't independently confirmed, so
  hard drop checks for both `' '` and `'Space'`.
- `drawString` always takes exactly 3 args; `setTextColor` always takes
  exactly 1 (no background-color form). There's no `textWidth()` — all text
  layout uses the fixed metric of 6 px/char at `setTextSize(1)`, 12 at size
  2, 18 at size 3.
- `audio.tone()` **blocks**. Tones are only used on lock, line-clear, and
  level-up — never on move/rotate, which would freeze the main loop at DAS
  repeat rates.

See `../arcade-split/README.md` for more general Bruce JS API notes gathered
while building the games in that directory (this file mostly assumes
familiarity with those, but restates anything specific to Tetris).
