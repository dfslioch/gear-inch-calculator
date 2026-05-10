// domain.js
// Domain model: data factories, seed reference libraries, and helper functions.
//
// All domain objects are PLAIN serialisable JS objects — no methods or getters.
// This ensures JSON.stringify / JSON.parse round-trips perfectly.
// Behaviour lives in the helper functions below, not on the objects themselves.
//
// All physical sizes in microns (1 micron = 0.001 mm).

// ── ID generation ─────────────────────────────────────────────────────────────
// Timestamp + random suffix — survives page reload unlike a simple counter.
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Enumerations ──────────────────────────────────────────────────────────────

const HubShape = Object.freeze({
  SINGLE_SIDED : 'singleSided',  // one sprocket; fixed or freewheel
  FLIP_FLOP    : 'flipFlop',     // two sprockets, one per side; at most one freewheel side
  CASSETTE     : 'cassette',     // N-speed cassette
  HUB_GEAR     : 'hubGear',      // internal gear hub
});

const ShifterType = Object.freeze({
  NONE     : 'none',     // track / fixie / single-speed — no shifters
  GEARED   : 'geared',   // external derailleur; speed count defined on Bicycle
  HUB_GEAR : 'hubGear',  // internal gear hub shifter
});

const FlipFlopSide = Object.freeze({ A: 'A', B: 'B' });

// ── Seed reference libraries ──────────────────────────────────────────────────
// Built-in entries. Users may add custom entries stored in the Stable.
// bsd and width values are in microns.

const RimLibrary = Object.freeze([
  { name: '700c / 29er',          bsd: 622000 },
  { name: '650b / 27.5"',         bsd: 584000 },
  { name: '650c',                 bsd: 571000 },
  { name: '28"',                  bsd: 635000 },
  { name: '27"',                  bsd: 630000 },
  { name: '26"',                  bsd: 559000 },
  { name: '24" (S5)',             bsd: 547000 },
  { name: '24" (E6)',             bsd: 540000 },
  { name: '24" (Terry)',          bsd: 520000 },
  { name: '24" (MTB/BMX)',        bsd: 507000 },
  { name: '20" (Recumbent)',      bsd: 451000 },
  { name: '20" (Schwinn)',        bsd: 419000 },
  { name: '20" (BMX/Recumbent)', bsd: 406000 },
  { name: '16" (Brompton)',       bsd: 349000 },
]);

const TyreLibrary = Object.freeze([
  { name: '20mm',   width:  20000 },
  { name: '23mm',   width:  23000 },
  { name: '25mm',   width:  25000 },
  { name: '28mm',   width:  28000 },
  { name: '32mm',   width:  32000 },
  { name: '35mm',   width:  35000 },
  { name: '37mm',   width:  37000 },
  { name: '38mm',   width:  38000 },
  { name: '44mm',   width:  44000 },
  { name: '45mm',   width:  45000 },
  { name: '50mm',   width:  50000 },
  { name: '56mm',   width:  56000 },
  { name: '1.00"',  width:  25400 },
  { name: '1.25"',  width:  31750 },
  { name: '1.5"',   width:  38100 },
  { name: '1.75"',  width:  44450 },
  { name: '1.9"',   width:  48260 },
  { name: '1.95"',  width:  49500 },
  { name: '2.00"',  width:  50800 },
  { name: '2.10"',  width:  53340 },
  { name: '2.125"', width:  54000 },
  { name: '2.20"',  width:  55880 },
  { name: '2.25"',  width:  57150 },
  { name: '2.30"',  width:  58420 },
  { name: '2.35"',  width:  59690 },
  { name: '2.40"',  width:  60960 },
  { name: '2.50"',  width:  63500 },
  { name: '2.75"',  width:  69850 },
  { name: '3.00"',  width:  76200 },
]);

const CrankLengths = Object.freeze([
  { name: '165mm',   microns: 165000 },
  { name: '170mm',   microns: 170000 },
  { name: '172.5mm', microns: 172500 },
  { name: '175mm',   microns: 175000 },
  { name: '180mm',   microns: 180000 },
]);

// ── Hub factories ─────────────────────────────────────────────────────────────

// Single-sided hub: one sprocket, fixed or freewheel.
// (Replaces the old Fixie / SingleSpeed enum distinction.)
function makeSingleSidedHub({ toothCount, isFixed, name = '' } = {}) {
  return {
    shape:   HubShape.SINGLE_SIDED,
    sprocket: { name, toothCount, isFixed },
  };
}

// Flip-flop hub: Side A and Side B, each a sprocket with isFixed flag.
// Constraint: at most one freewheel side — throws if both are freewheel.
function makeFlipFlopHub({ sideA, sideB, activeSide = FlipFlopSide.A } = {}) {
  if (!sideA.isFixed && !sideB.isFixed) {
    throw new Error('A flip-flop hub cannot have freewheel on both sides.');
  }
  return {
    shape:      HubShape.FLIP_FLOP,
    sideA:      { name: sideA.name || 'Side A', toothCount: sideA.toothCount, isFixed: sideA.isFixed },
    sideB:      { name: sideB.name || 'Side B', toothCount: sideB.toothCount, isFixed: sideB.isFixed },
    activeSide,
  };
}

// N-speed cassette hub.
// sprockets: [{ toothCount, name }] — list of cassette sprockets.
function makeCassetteHub({ speedCount, sprockets = [], name = '' } = {}) {
  return {
    shape:      HubShape.CASSETTE,
    name,
    speedCount,
    sprockets,
  };
}

// Internal gear hub.
// sprocket: { toothCount, name } — the single external sprocket.
// ratios: [number] — gear ratios, will be sorted ascending.
function makeHubGearHub({ sprocket = {}, ratios = [], name = '' } = {}) {
  return {
    shape:    HubShape.HUB_GEAR,
    name,
    sprocket: { name: sprocket.name || '', toothCount: sprocket.toothCount || 0 },
    ratios:   [...ratios].sort((a, b) => a - b),
  };
}

// ── Wheelset factory ──────────────────────────────────────────────────────────

// A wheelset is a rim + tyre + hub combination.
// rimBsd and tyreWidth in microns.
function makeWheelset({ name = 'Wheelset', rimBsd, tyreWidth, hub, id = null } = {}) {
  return { id: id || newId(), name, rimBsd, tyreWidth, hub };
}

// ── CrankSet factory ──────────────────────────────────────────────────────────

// crankLengthMicrons: from CrankLengths seed data.
// chainRings / spareChainRings: [{ toothCount, name, bcd }]
function makeCrankSet({ crankLengthMicrons = 172500, chainRings = [], spareChainRings = [] } = {}) {
  return { crankLengthMicrons, chainRings, spareChainRings };
}

// ── Bicycle factory ───────────────────────────────────────────────────────────

// shifterType: one of ShifterType values.
// speeds: integer speed count for GEARED bikes (e.g. 11); null otherwise.
// wheelsets: [Wheelset] — must contain at least one entry (created by caller or
//            use makeBicycle which creates a default if none provided).
// spareSprockets: [{ toothCount, name }] — for SINGLE_SIDED / FLIP_FLOP bikes only.
function makeBicycle({
  name             = 'My Bike',
  shifterType      = ShifterType.NONE,
  speeds           = null,
  crankSet         = null,
  wheelsetIds      = [],   // IDs referencing stable.wheelsets
  activeWheelsetId = null,
  // Parts pool — for ShifterType.NONE bikes only
  chainRingPool    = [],   // number[] — tooth counts of all available chainrings
  sprocketPool     = [],   // [{ toothCount, isFixed }] — all available sprockets
  fittedChainRing  = null, // number | null — currently fitted chainring (for highlighting)
  fittedSprockets  = [],   // number[] — fitted sprocket tooth counts (1 or 2 for flip-flop)
  id               = null,
} = {}) {
  const bike = {
    id:              id || newId(),
    name,
    shifterType,
    speeds,
    crankSet:        crankSet || makeCrankSet(),
    wheelsetIds,
    activeWheelsetId,
    chainRingPool,
    sprocketPool,
    fittedChainRing,
    fittedSprockets,
  };
  if (bike.wheelsetIds.length > 0 && !bike.activeWheelsetId) {
    bike.activeWheelsetId = bike.wheelsetIds[0];
  }
  return bike;
}

// ── Stable factory ────────────────────────────────────────────────────────────

function makeStable(name = 'My Stable') {
  return {
    name,
    bicycles:     [],
    wheelsets:    [],   // independent wheelset pool; bikes reference by ID
    customRims:   [],   // user-added rim entries:   [{ name, bsd }]
    customTyres:  [],   // user-added tyre entries:  [{ name, width }]
    customCranks: [],   // user-added crank entries: [{ name, microns }]
  };
}

// ── Domain helper functions ───────────────────────────────────────────────────
// Operate on plain data objects. Call these instead of reaching into objects directly.

// stable must be passed so we can look up from the shared wheelset pool.
function getActiveWheelset(bicycle, stable) {
  if (!bicycle.activeWheelsetId) return null;
  return stable.wheelsets.find(w => w.id === bicycle.activeWheelsetId) ?? null;
}

// Returns the active sprocket for skid-patch and gear calculations.
// For cassette hubs, returns null (caller iterates all sprockets separately).
function getActiveSprocket(hub) {
  if (!hub) return null;
  switch (hub.shape) {
    case HubShape.SINGLE_SIDED:
      return hub.sprocket;
    case HubShape.FLIP_FLOP:
      return hub.activeSide === FlipFlopSide.A ? hub.sideA : hub.sideB;
    case HubShape.HUB_GEAR:
      return hub.sprocket;
    default:
      return null;
  }
}

// Whether the currently active drivetrain is fixed gear (skid patches applicable).
function isFixedDrivetrain(hub) {
  if (!hub) return false;
  const sprocket = getActiveSprocket(hub);
  return sprocket ? !!sprocket.isFixed : false;
}

// Full rim library including user-added custom entries.
function getRimLibrary(stable) {
  return [...RimLibrary, ...(stable.customRims || [])];
}

// Full tyre library including user-added custom entries.
function getTyreLibrary(stable) {
  return [...TyreLibrary, ...(stable.customTyres || [])];
}

// Full crank length library including user-added custom entries.
function getCrankLibrary(stable) {
  return [...CrankLengths, ...(stable.customCranks || [])];
}

// Compatibility check: can this wheelset be fitted to this bike?
// Returns true if compatible, false otherwise.
function isWheelsetCompatible(bicycle, wheelset) {
  const hub = wheelset.hub;
  switch (bicycle.shifterType) {
    case ShifterType.NONE:
      // No-shifter bikes accept single-sided and flip-flop hubs only.
      return hub.shape === HubShape.SINGLE_SIDED || hub.shape === HubShape.FLIP_FLOP;
    case ShifterType.GEARED:
      // Geared bikes need a cassette hub with matching speed count.
      return hub.shape === HubShape.CASSETTE && hub.speedCount === bicycle.speeds;
    case ShifterType.HUB_GEAR:
      return hub.shape === HubShape.HUB_GEAR;
    default:
      return false;
  }
}

// Human-readable description of a hub — used in bike list cards.
function describeHub(hub) {
  if (!hub) return 'No hub';
  switch (hub.shape) {
    case HubShape.SINGLE_SIDED:
      return hub.sprocket.isFixed ? 'Fixed gear' : 'Single speed';
    case HubShape.FLIP_FLOP: {
      const a = hub.sideA.isFixed ? 'fixed' : 'freewheel';
      const b = hub.sideB.isFixed ? 'fixed' : 'freewheel';
      const active = hub.activeSide === FlipFlopSide.A ? 'A' : 'B';
      return `Flip-flop ${hub.sideA.toothCount}t(${a}) / ${hub.sideB.toothCount}t(${b}) — active: ${active}`;
    }
    case HubShape.CASSETTE:
      return `${hub.speedCount}-speed cassette`;
    case HubShape.HUB_GEAR:
      return `Hub gear (${hub.ratios.length} speeds)`;
    default:
      return 'Unknown hub';
  }
}
