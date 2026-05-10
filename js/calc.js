// calc.js
// Pure gear drivetrain calculation functions.
// All physical sizes in microns (1 micron = 0.001 mm).
// No side-effects, no global state — safe to call from any context.

const GearCalc = (() => {

  // Greatest common divisor (Euclidean algorithm) — used for skid patches.
  function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (a !== 0) { const r = b % a; b = a; a = r; }
    return b;
  }

  // Wheel diameter in inches from rim BSD and tyre width (both in microns).
  // BSD = bead seat diameter (the rim measurement).
  // Full diameter = BSD + 2 × tyre width.
  function diameterInches(rimBsd, tyreWidth) {
    return (rimBsd + 2 * tyreWidth) / 25400;
  }

  return {

    // ── Core metrics ─────────────────────────────────────────────────────────

    // Gear inches: effective wheel diameter multiplied by transmission ratio.
    gearInches(rimBsd, tyreWidth, chainring, sprocket) {
      return diameterInches(rimBsd, tyreWidth) * (chainring / sprocket);
    },

    // Gain ratio: dimensionless ratio of distance travelled to crank arc.
    // crankLength in microns.
    gainRatio(rimBsd, tyreWidth, crankLength, chainring, sprocket) {
      const wheelRadius = (rimBsd + 2 * tyreWidth) / 2;   // microns
      return (wheelRadius / crankLength) * (chainring / sprocket);
    },

    // Metres of development: distance travelled per pedal revolution (metres).
    metresDevelopment(rimBsd, tyreWidth, chainring, sprocket) {
      const circumferenceM = diameterInches(rimBsd, tyreWidth) * Math.PI * 0.0254;
      return circumferenceM * (chainring / sprocket);
    },

    // ── Speed ────────────────────────────────────────────────────────────────

    // Speed in km/h at a given cadence (rpm).
    speedKMH(rimBsd, tyreWidth, chainring, sprocket, cadence) {
      // metresDevelopment × cadence(rev/min) × 60(min/hr) ÷ 1000(m/km)
      return this.metresDevelopment(rimBsd, tyreWidth, chainring, sprocket)
             * cadence * 60 / 1000;
    },

    // Speed in mph.
    speedMPH(rimBsd, tyreWidth, chainring, sprocket, cadence) {
      return this.speedKMH(rimBsd, tyreWidth, chainring, sprocket, cadence) / 1.60934;
    },

    // Speed in m/s.
    speedMS(rimBsd, tyreWidth, chainring, sprocket, cadence) {
      return this.metresDevelopment(rimBsd, tyreWidth, chainring, sprocket)
             * cadence / 60;
    },

    // ── Skid patches ─────────────────────────────────────────────────────────
    // Only meaningful for fixed-gear drivetrains.
    // isAmbi: true if the rider can skid with either foot forward.

    skidPatches(chainring, sprocket, isAmbi = false) {
      const g       = gcd(chainring, sprocket);
      let   patches = sprocket / g;
      if (isAmbi && patches % 2 === 1) patches *= 2;
      return patches;
    },

    // ── Utility ──────────────────────────────────────────────────────────────

    // Returns a full result set for a given wheel + crank + chainring × sprocket combination.
    // Useful for populating a gear table in one call.
    fullCalc(rimBsd, tyreWidth, crankLength, chainring, sprocket, cadence = 90, isFixed = false, isAmbi = false) {
      return {
        gearInches:         +this.gearInches(rimBsd, tyreWidth, chainring, sprocket).toFixed(2),
        gainRatio:          +this.gainRatio(rimBsd, tyreWidth, crankLength, chainring, sprocket).toFixed(3),
        metresDevelopment:  +this.metresDevelopment(rimBsd, tyreWidth, chainring, sprocket).toFixed(3),
        speedKMH:           +this.speedKMH(rimBsd, tyreWidth, chainring, sprocket, cadence).toFixed(1),
        speedMPH:           +this.speedMPH(rimBsd, tyreWidth, chainring, sprocket, cadence).toFixed(1),
        skidPatches:        isFixed ? this.skidPatches(chainring, sprocket, isAmbi) : null,
      };
    },
  };
})();
