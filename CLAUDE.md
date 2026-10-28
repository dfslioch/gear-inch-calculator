# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this PWA.

## Overview

Progressive Web App — the primary deliverable for the GearInch Calculator project. Hosted on GitHub Pages at **https://gearinchcalc.sliochsoftware.ca** (repo: `dfslioch/gear-inch-calculator`). Vanilla HTML/CSS/JS, no build step, no framework, no server.

The C# prototype at `C:\Users\David\My Cloud\DropBox\Envirochem\My C# Projects\SliochSoftware\GearInchCalculator\Quick_GearInch` and the VB.NET predecessor at `C:\Users\David\My Cloud\DropBox\Envirochem\My VB Projects\GearInch03` define the domain model and calculation logic. This PWA now lives at `C:\dev\subdomain_gearinchcalculator`, separate from those projects — consult them when making design decisions, but there is no longer a parent/sibling folder relationship.

## Running locally

Open `index.html` directly in a browser, or serve with any static file server:
```
npx serve .
python -m http.server 8080
```
Service worker registration requires a served origin (not `file://`). All other functionality works from `file://`.

## Deployment

- **Repo:** `dfslioch/gear-inch-calculator` — `main` branch, published from repo root
- **Live URL:** https://gearinchcalc.sliochsoftware.ca (CNAME → dfslioch.github.io)
- **Publishing:** `git push` to main — GitHub Pages serves the root automatically
- **Cache busting:** bump the `CACHE` version string in `sw.js` on every JS/CSS change so installed PWAs pick up updates

## File structure

```
index.html          — app shell; single HTML page
manifest.json       — PWA manifest (name, icons, display mode)
sw.js               — service worker; cache-first offline strategy; CACHE = 'gearcalc-v28'
CNAME               — custom domain for GitHub Pages
css/
  style.css         — mobile-first styles; all layout and theming
js/
  calc.js           — pure calculation functions (gear inches, gain ratio, etc.)
  domain.js         — data factories, seed libraries, and domain helper functions
  db.js             — IndexedDB persistence + JSON export/import
  forms.js          — reusable form-building helpers used by app.js
  app.js            — view rendering, navigation, event wiring, startup
icons/
  sliochsoftware_logo.png  — wide logo shown in header on desktop (≥481px)
  sliochsoftware_icon.png  — square icon shown in header on mobile (≤480px); also PWA icon
  icon-192.png             — alias/copy used as favicon
```

## Architecture

**No framework.** Plain ES6+ organised into script files. Load order in `index.html` matters:
`calc.js → domain.js → db.js → forms.js → app.js`

**All sizes in microns** throughout (1 micron = 0.001 mm), matching the C# reference model. Enums are `Object.freeze`d plain objects.

### calc.js
Pure functions only. No state. Takes raw numbers (microns, tooth counts, cadence), returns numbers.
Key exports: `gearInches`, `gainRatio`, `metresDevelopment`, `skidPatches`.

### domain.js
Three layers:
- **Seed data:** `RimLibrary`, `TyreLibrary`, `CrankLengths`, `ComponentLibrary` — built-in reference lists.
- **Factory functions:** `makeStable`, `makeBicycle`, `makeWheelset`, `makeSingleSidedHub`, `makeFlipFlopHub`, `makeCassetteHub`, `makeHubGearHub`, `makeCrankSet`, `makeComponent`.
- **Helper functions:** `getActiveWheelset`, `getActiveSprocket`, `isFixedDrivetrain`, `getRimLibrary`, `getTyreLibrary`, `getCrankLibrary`, `getComponentLibrary`, `isWheelsetCompatible`, `describeHub`.

All domain objects are **plain serialisable JS objects** — no methods or getters. `JSON.stringify` / `JSON.parse` round-trips without data loss. Behaviour lives in helpers, not on the objects.

#### makeStable shape
```js
{
  name, bicycles, wheelsets,
  customRims, customTyres, customCranks, customComponents,
  distanceUnit: 'km' | 'mi'
}
```

#### makeBicycle shape (key fields)
```js
{
  id, name, shifterType, speeds, crankSet,
  wheelsetIds, activeWheelsetId,
  chainRingPool, sprocketPool, fittedChainRing, fittedSprockets,
  odometer, components, maintenanceLog
}
```

#### makeComponent shape
```js
{
  id, name, expectedLife, lifeUnit,   // 'km'|'mi'|'days'|'months'|'years'
  installedAt, installedDate, notes, history
}
```

### db.js
Stores the entire Stable as a single JSON record in IndexedDB (`key = 'current'`). Also provides `exportJSON` (downloads a `.json` file) and `importJSON` (reads a file and parses it).

### app.js
**State:** `AppState = { stable, maintBikeId }`.

**View router:** `showView(name)` renders one of `stable | calculator | maintenance | library` into `#main-content`. Each view has a `{ title, render, wire }` entry in `viewConfig`.

**Navigation:** 4 tabs at bottom — Stable | Calculator | Maintenance | Library. The Maintenance tab button (`#nav-maintenance`) is controlled by `updateMaintenanceGate()` which calls `isMaintenanceEnabled()`. Currently always returns `true` (gate removed but logic preserved as a comment for future use).

**Maintenance helpers:**
- `componentWearPct(comp, bike)` — returns fraction 0–1+ or `null`; used for both traffic-light colour and sort order
- `componentStatus(comp, bike)` — returns `'green'` / `'orange'` / `'red'` / `null`
- `componentProgressText(comp, bike)` — human-readable progress string
- `renderMaintenanceView()` / `wireMaintenanceEvents()` — maintenance tab
- Components sorted by `componentWearPct` descending (greatest wear first)
- History merges component replacements (`kind:'replacement'`) and session log entries (`kind:'session'`, prefixed 🔧), sorted by date descending

**Calculator results:** all three paths (IGH, cassette/SS/FF, NONE pool) show Gear Inches → Gain Ratio → Metres of Development → Speed → Skid Patches.

**IGH calculation:** base gear-inch = chainring/sprocket; each internal ratio multiplied by base to produce per-gear results.

## Key domain design rules

- `HubShape` (on the wheelset) and `ShifterType` (on the bike) must be compatible. Validate before swapping a wheelset.
- Flip-flop hubs: **at most one freewheel side** — Freewheel+Freewheel is a validation error.
- Skid patches only when `isFixedDrivetrain(hub)` returns `true`.
- A `Bicycle` always has at least one wheelset (created on init). `activeWheelsetId` points to the current one.
- `Fixie` and `SingleSpeed` are the same hub shape (`HubShape.SINGLE_SIDED`) distinguished only by `sprocket.isFixed`.

## Maintenance feature

**Status thresholds:** green < 75%, orange 75–95%, red ≥ 95%.

**Replace workflow:** logs `{ date, odometer, notes }` to `component.history[]`, resets `installedAt` to current odometer and `installedDate` to today.

**Maintenance session log:** free-form sessions stored in `bike.maintenanceLog` as `{ id, date, odometer, notes }`. Rendered in the unified history view alongside component replacements.

**Component library:** `ComponentLibrary` constant in `domain.js` is the built-in list. Users can add to `stable.customComponents`. Both are merged by `getComponentLibrary(stable)`.

## Icons and PWA

- `manifest.json` icons use `sliochsoftware_icon.png` at both 192×192 and 512×512 with `"purpose": "any"`.
- Header uses `<picture>` to switch between wide logo (desktop) and square icon (mobile ≤480px).
- SW cache version must be bumped on every JS/CSS change to force PWA update.
