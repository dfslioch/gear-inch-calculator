# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Progressive Web App (PWA) — the primary deliverable for the GearInch Calculator project. Hosted on GitHub Pages. Vanilla HTML/CSS/JS, no build step, no framework, no server.

The C# prototype in the parent folder (`../Quick_GearInch/`) and the VB.NET predecessor at `C:\Users\David\My Cloud\DropBox\Envirochem\My VB Projects\GearInch03` define the domain model and calculation logic that this app implements. Consult those projects and their CLAUDE.md files for design intent.

## Running locally

Open `index.html` directly in a browser, or serve the folder with any static file server, e.g.:
```
npx serve .
python -m http.server 8080
```

Service worker registration requires a served origin (not `file://`). All other functionality works from `file://`.

## File structure

```
index.html          — app shell; single HTML page
manifest.json       — PWA manifest (name, icons, display mode)
sw.js               — service worker; cache-first offline strategy
css/
  style.css         — mobile-first styles; all layout and theming
js/
  calc.js           — pure calculation functions (gear inches, gain ratio, etc.)
  domain.js         — data factories, seed libraries, and domain helper functions
  db.js             — IndexedDB persistence + JSON export/import
  app.js            — view rendering, navigation, event wiring, startup
icons/
  icon-192.png      — PWA icon (to be added)
  icon-512.png      — PWA icon (to be added)
```

## Architecture

**No framework.** Plain ES6+ modules-style code organised into IIFEs. Load order in index.html matters: `calc.js → domain.js → db.js → app.js`.

**All sizes in microns** throughout (1 micron = 0.001 mm), matching the C# reference model. Enums are `Object.freeze`d plain objects.

### calc.js
Pure functions only. No state. Takes raw numbers (microns, tooth counts, cadence), returns numbers. Safe to call from any context.

### domain.js
Two layers:
- **Seed data**: `RimLibrary`, `TyreLibrary`, `CrankLengths` — built-in reference lists. Users can add custom entries stored alongside these in the Stable.
- **Factory functions**: `makeStable`, `makeBicycle`, `makeWheelset`, `makeSingleSidedHub`, `makeFlipFlopHub`, `makeCassetteHub`, `makeHubGearHub`, `makeCrankSet`.
- **Helper functions**: operate on plain data objects — `getActiveWheelset`, `getActiveSprocket`, `isFixedDrivetrain`, `getRimLibrary`, `getTyreLibrary`.

All domain objects are **plain serialisable JS objects** (no methods or getters). This ensures `JSON.stringify` / `JSON.parse` round-trips without data loss. Behaviour lives in helper functions, not on the objects.

### db.js
Stores the entire Stable as a single JSON record in IndexedDB (`key = 'current'`). Also provides `exportJSON` (downloads a `.json` file) and `importJSON` (reads a file and parses it).

### app.js
View router: `showView(name)` renders one of `stable | calculator | library` into `#main-content`. `AppState.stable` holds the in-memory Stable. All mutations go through `AppState`, then `DB.save()`.

## Key domain design rules

See the parent project's `CLAUDE.md` for full detail. Critical points:

- `HubShape` (on the wheelset) and `ShifterType` (on the bike) must be compatible. Validate before swapping a wheelset onto a bike.
- Flip-flop hubs: **at most one freewheel side** — Freewheel+Freewheel is a validation error.
- Skid patches are only calculable when `isFixedDrivetrain(hub)` returns `true`.
- A `Bicycle` always has at least one wheelset (created on init). `activeWheelsetId` points to the current one.
- `Fixie` and `SingleSpeed` are the same hub shape (`HubShape.SINGLE_SIDED`) distinguished only by `sprocket.isFixed`.
