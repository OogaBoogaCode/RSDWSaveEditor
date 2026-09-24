# RSDWSaveEditor

Browser-based save editor for RuneScape: Dragonwilds. Upload a world (`.sav`) or character (`.json`) save, edit it, download the new file. Everything runs client-side: the file is held in memory for the life of the tab and never sent anywhere (the CSP sets `connect-src 'none'`).

Static site, no build step, no dependencies. Vercel serves the repo root as-is.

## What it edits

**World saves** (`%LOCALAPPDATA%\RSDragonwilds\Saved\SaveGames\*.sav`)
- World name, friendly fire, session password, crossplay, in-game clock
- Difficulty mode (Normal, Hard, Creative, Custom) and all 66 custom difficulty settings with the game's labels, ranges and Normal/Hard/Creative presets (written to both the load-screen header and `WorldSaveSettings`)
- Contents of chests, crates and other containers, with item names: stack counts, durability, duplicate, remove, add any item from the game catalog
- Processing station / weather / event state (embedded JSON)
- Advanced: every stored object and property

**Character saves** (`%LOCALAPPDATA%\RSDragonwilds\Saved\SaveCharacters\*.json`)
- Name, hardcore flag, vitals
- Skill XP
- Backpack, personal storage and equipped items
- Raw JSON

**Dedicated server settings** (`DedicatedServer.ini`)
- Server name, world to load, world password, max players (with recommended RAM: 2 GB + 1 GB per player), crossplay on/off (off removes PlatformPolicy), owner, crash reports
- Known players: rename, ban/unban, privilege mask, add by user ID, remove
- Raw file; unknown keys, comments and ordering are preserved, and the file keeps its encoding (UTF-16 when it holds non-ASCII names, as Unreal writes it)

**Templates** (no upload needed)
- New `DedicatedServer.ini` with defaults; the first player added becomes the owner, and the server fills in its own ServerGuid
- New `BuildingSettings.ini` to change the protection totem limit (experimental: sets `MaximumBuildingProtectionTotems` and the totem entry of `PieceTagToMaxCountMap`, as in the game's DefaultBuildingSettings.ini)

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
src/ini.js        DedicatedServer.ini parse/write
src/data.js       difficulty settings (generated from game data)
src/catalog.js    item/skill names (generated)
src/app.js        UI
vercel.json       security headers, caching
```

`src/catalog.js` maps the game's item and skill PersistenceIDs (base64url GUIDs used in saves) to display names. It is generated from the game's asset registry and string tables and needs regenerating after game updates that add items.

Unofficial fan tool, not affiliated with Jagex.
