# RSDWSaveEditor

Browser-based save editor for RuneScape: Dragonwilds. Upload a world (`.sav`) or character (`.json`) save, edit it, download the new file. Everything runs client-side: the file is held in memory for the life of the tab and never sent anywhere (the CSP sets `connect-src 'none'`).

Static site, no build step, no dependencies. Vercel serves the repo root as-is.

## What it edits

**World saves** (`%LOCALAPPDATA%\RSDragonwilds\Saved\SaveGames\*.sav`)
- World name, friendly fire, session password, crossplay, in-game clock
- Difficulty mode and every custom difficulty setting (written to both the load-screen header and `WorldSaveSettings`)
- Contents of chests, crates and other containers: stack counts, durability, duplicate, remove, add items already present in the file
- Processing station / weather / event state (embedded JSON)
- Advanced: every stored object and property

**Character saves** (`%LOCALAPPDATA%\RSDragonwilds\Saved\SaveCharacters\*.json`)
- Name, hardcore flag, vitals
- Skill XP
- Backpack, personal storage and equipped items
- Raw JSON

## Format notes

World saves are [SPUD](https://github.com/sinbad/SPUD) (Steve's Persistent Unreal Data) chunk files with Dragonwilds-specific additions:

- Objects (`NOBJ`, `SPWN`) and levels (`LEVL`) carry extra header bytes (engine versions; spawn transforms and component class IDs on `SPWN`). The parser measures these by finding the offset from which child chunks chain exactly to the parent's end, and keeps them verbatim.
- Class definitions are wrapped in `CDVE` chunks; `GLAI`/`LVNI` hold level indexes.
- Property type `40` is a nested component: `ClassID` + its own offsets/data block. Container inventories are JSON strings inside these components.
- Custom difficulty lives in the `CINF` header as named float entries (`Difficulty.*`), which is the copy the game reads, and is mirrored as a tagged array in `WorldSaveSettings/CustomDifficultySettings`.

Unknown bytes are never interpreted, only carried through. Unedited files round-trip byte-for-byte, and chunk lengths and property offsets are rebuilt on write. Objects whose stored layout does not match their class definition are shown read-only.

Character saves are Unreal-formatted JSON (tabs, CRLF, inline numeric arrays). `src/uejson.js` preserves number text and key order so untouched values are written back unchanged. The trailing `Backup` value is left as-is.

## Layout

```
index.html, styles.css, favicon.svg
src/spud.js       chunk tree parse/write
src/model.js      class defs, property decode/patch, world settings, difficulty
src/uejson.js     Unreal-style JSON parse/stringify
src/inventory.js  slot helpers
src/data.js       difficulty tag list
src/app.js        UI
vercel.json       security headers, caching
```

Item and skill names are not bundled. The game identifies them by asset GUIDs, and no licensed name catalog is available to include.

Unofficial fan tool, not affiliated with Jagex.
