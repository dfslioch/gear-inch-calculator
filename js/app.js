// app.js
// Application shell: view routing, Stable initialisation, event wiring.
// AppState holds the single in-memory Stable. All mutations update AppState
// then call DB.save() to persist.

const AppState = { stable: null };

// ── Parts pool migration ──────────────────────────────────────────────────────
// For NONE bikes saved before pools were added, auto-populate from hub / crankSet.

function migrateNoneBikePools(stable) {
  for (const bike of stable.bicycles) {
    if (!Array.isArray(bike.chainRingPool))  bike.chainRingPool  = [];
    if (!Array.isArray(bike.sprocketPool))   bike.sprocketPool   = [];
    if (!Array.isArray(bike.fittedSprockets)) bike.fittedSprockets = [];
    if (bike.fittedChainRing === undefined)   bike.fittedChainRing = null;

    if (bike.shifterType !== ShifterType.NONE) continue;

    // Populate chainRingPool from crankSet if empty
    if (!bike.chainRingPool.length && bike.crankSet?.chainRings?.length) {
      bike.chainRingPool  = bike.crankSet.chainRings.map(r => r.toothCount);
      bike.fittedChainRing = bike.chainRingPool[0] ?? null;
    }

    // Populate sprocketPool from hub if empty
    if (!bike.sprocketPool.length) {
      const ws  = getActiveWheelset(bike, stable);
      const hub = ws?.hub;
      if (hub?.shape === HubShape.SINGLE_SIDED) {
        bike.sprocketPool   = [{ toothCount: hub.sprocket.toothCount, isFixed: hub.sprocket.isFixed }];
        bike.fittedSprockets = [hub.sprocket.toothCount];
      } else if (hub?.shape === HubShape.FLIP_FLOP) {
        bike.sprocketPool   = [
          { toothCount: hub.sideA.toothCount, isFixed: hub.sideA.isFixed },
          { toothCount: hub.sideB.toothCount, isFixed: hub.sideB.isFixed },
        ];
        bike.fittedSprockets = [hub.sideA.toothCount, hub.sideB.toothCount];
      }
    }
  }
}

// ── View: Stable (with Bikes / Wheelsets sub-tabs) ───────────────────────────

let stableSubTab = 'bikes';   // 'bikes' | 'wheelsets'

// Library collapse state — persists across re-renders within a session
const libraryCollapsed = { 'rim-body': true, 'tyre-body': true, 'crank-body': true };

function renderStableView() {
  const subNav = `<div class="sub-nav">
    <button class="sub-nav-btn${stableSubTab === 'bikes' ? ' active' : ''}" data-sub="bikes">Bikes</button>
    <button class="sub-nav-btn${stableSubTab === 'wheelsets' ? ' active' : ''}" data-sub="wheelsets">Wheelsets</button>
  </div>`;
  return subNav + (stableSubTab === 'bikes' ? renderBikesSubView() : renderWheelsetsSubView());
}

function wireStableEvents() {
  document.querySelectorAll('.sub-nav-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      stableSubTab = btn.dataset.sub;
      showView('stable');
    }));

  if (stableSubTab === 'bikes') {
    wireBikesSubView();
  } else {
    wireWheelsetsSubView();
  }
}

// ── Sub-view: Bikes ───────────────────────────────────────────────────────────

function renderBikesSubView() {
  const s = AppState.stable;
  const help = `<aside class="help-text">
    <p>Your stable holds all your bikes. Each bike has a drivetrain type — no shifters (track/single-speed), geared (cassette), or internal hub gear — plus a crankset and one or more wheelsets.</p>
    <p>Tap a bike to view its details, assign wheelsets, manage its parts pool, and run gear calculations.</p>
  </aside>`;

  if (!s.bicycles.length) {
    return `<div class="empty-state">
      <p>No bikes in your stable yet.</p>
      <button id="btn-add-bike" class="btn-primary">Add your first bike</button>
    </div>${help}`;
  }

  const items = s.bicycles.map(bike => {
    const ws   = getActiveWheelset(bike, s);
    const meta = ws ? describeHub(ws.hub) : 'No wheelset assigned';
    return `<li class="bike-card" data-id="${bike.id}">
      <span class="bike-name">${escHtml(bike.name)}</span>
      <span class="bike-meta">${escHtml(meta)}</span>
    </li>`;
  }).join('');

  return `<ul class="bike-list">${items}</ul>
    <button id="btn-add-bike" class="btn-primary btn-fab" aria-label="Add bike">+</button>
    ${help}`;
}

function wireBikesSubView() {
  document.getElementById('btn-add-bike')
    ?.addEventListener('click', () => showAddBikeForm());
  document.querySelectorAll('.bike-card').forEach(card =>
    card.addEventListener('click', () => showBikeDetail(card.dataset.id)));
}

// ── Sub-view: Wheelsets ───────────────────────────────────────────────────────

function renderWheelsetsSubView() {
  const s = AppState.stable;
  const help = `<aside class="help-text">
    <p>Wheelsets combine a rim, tyre, and hub and are shared across your stable. A wheelset can be assigned to any compatible bike — compatibility is determined by hub type and the bike's shifter type.</p>
    <p>Create wheelsets here first, then assign them to bikes from the bike detail view.</p>
  </aside>`;

  if (!s.wheelsets.length) {
    return `<div class="empty-state">
      <p>No wheelsets yet.</p>
      <button id="btn-add-wheelset" class="btn-primary">Add your first wheelset</button>
    </div>${help}`;
  }

  const items = s.wheelsets.map(ws => {
    const rimMm  = (ws.rimBsd  / 1000).toFixed(0);
    const tyreMm = (ws.tyreWidth / 1000).toFixed(1);
    return `<li class="bike-card" data-id="${ws.id}">
      <div>
        <span class="bike-name">${escHtml(ws.name)}</span>
        <span class="bike-meta">${escHtml(describeHub(ws.hub))}</span>
      </div>
      <span class="bike-meta">${rimMm} / ${tyreMm}mm</span>
    </li>`;
  }).join('');

  return `<ul class="bike-list">${items}</ul>
    <button id="btn-add-wheelset" class="btn-primary btn-fab" aria-label="Add wheelset">+</button>
    ${help}`;
}

function wireWheelsetsSubView() {
  document.getElementById('btn-add-wheelset')
    ?.addEventListener('click', () => showAddWheelsetForm());
  document.querySelectorAll('.bike-card').forEach(card =>
    card.addEventListener('click', () => showWheelsetDetail(card.dataset.id)));
}

// ── View: Calculator ──────────────────────────────────────────────────────────

function renderCalculatorView() {
  const s = AppState.stable;

  if (!s.bicycles.length) {
    return `<div class="view-placeholder">
      <p>Add a bike to your stable to use the calculator.</p>
    </div>`;
  }

  const bikeOptions = s.bicycles.map(b =>
    `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');

  return `<div>
    <div class="form-row">
      <label for="calc-bike">Bike</label>
      <select id="calc-bike">${bikeOptions}</select>
    </div>
    <div class="form-row">
      <label for="calc-cadence">Cadence (rpm)</label>
      <input id="calc-cadence" type="number" value="90" min="40" max="200">
    </div>
    <div id="calc-results"></div>
    <aside class="help-text">
      <p><strong>Gear inches</strong> describe the effective wheel diameter after the drivetrain ratio is applied — a higher number means a harder, faster gear. <strong>Metres of development</strong> is the distance travelled per pedal revolution.</p>
      <p>For track bikes, <strong>skid patches</strong> shows how many distinct tyre contact points are used when skidding — more patches means the tyre wears more evenly.</p>
      <p>For hub gear bikes, each column represents one internal gear, with its ratio shown beneath the gear number.</p>
    </aside>
  </div>`;
}

function wireCalculatorEvents() {
  const bikeSelect  = document.getElementById('calc-bike');
  const cadenceInput = document.getElementById('calc-cadence');
  if (!bikeSelect) return;

  const runCalc = () => {
    const bike    = AppState.stable.bicycles.find(b => b.id === bikeSelect.value);
    const cadence = parseInt(cadenceInput.value, 10) || 90;
    if (bike) renderCalcResults(bike, cadence);
  };

  bikeSelect.addEventListener('change', runCalc);
  cadenceInput.addEventListener('input', runCalc);
  runCalc();
}

function renderCalcResults(bike, cadence) {
  const ws = getActiveWheelset(bike, AppState.stable);
  if (!ws) {
    document.getElementById('calc-results').innerHTML =
      '<p class="error-msg">This bike has no active wheelset. Assign a wheelset from the Stable tab.</p>';
    return;
  }

  // NONE bikes with a populated pool get the full pool calculator
  if (bike.shifterType === ShifterType.NONE &&
      bike.chainRingPool?.length && bike.sprocketPool?.length) {
    renderCalcResultsFromPool(bike, ws, cadence);
    return;
  }

  // ── Geared / hub-gear / NONE bikes without pool (fallback) ───────────────
  const hub   = ws.hub;
  const rings = bike.crankSet.chainRings;

  if (!rings.length) {
    document.getElementById('calc-results').innerHTML =
      '<p class="error-msg">This bike has no chainrings configured.</p>';
    return;
  }

  // ── Hub Gear (IGH) ─────────────────────────────────────────────────────────
  // Columns = internal gear ratios; each cell = base chainring/sprocket result × ratio.
  if (hub.shape === HubShape.HUB_GEAR) {
    const sp     = hub.sprocket;
    const ratios = hub.ratios; // sorted ascending by domain factory

    if (!sp?.toothCount || !ratios?.length) {
      document.getElementById('calc-results').innerHTML =
        '<p class="error-msg">This hub gear has no sprocket or gear ratios configured.</p>';
      return;
    }

    const gearHeaders = ratios.map((r, i) =>
      `<th>Gear ${i + 1}<br><span style="font-weight:normal;font-size:0.75em">${r.toFixed(3)}</span></th>`
    ).join('');

    let html = `<p class="detail-muted" style="margin:0.25rem 0 0.75rem">
        Hub: ${escHtml(hub.sprocket.toothCount)}t sprocket &middot; ${ratios.length} internal gears</p>`;

    // Gear Inches
    html += `<h3 style="margin:1rem 0 0.5rem">Gear Inches</h3>
      <div class="gear-table-wrap"><table class="gear-table">
      <thead><tr><th>Ring</th>${gearHeaders}</tr></thead><tbody>`;
    for (const ring of rings) {
      const baseGI = GearCalc.gearInches(ws.rimBsd, ws.tyreWidth, ring.toothCount, sp.toothCount);
      const cells  = ratios.map(r => `<td>${(baseGI * r).toFixed(1)}</td>`).join('');
      html += `<tr><td>${ring.toothCount}t</td>${cells}</tr>`;
    }
    html += '</tbody></table></div>';

    // Metres of Development
    html += `<h3 style="margin:1rem 0 0.5rem">Metres of Development</h3>
      <div class="gear-table-wrap"><table class="gear-table">
      <thead><tr><th>Ring</th>${gearHeaders}</tr></thead><tbody>`;
    for (const ring of rings) {
      const baseMD = GearCalc.metresDevelopment(ws.rimBsd, ws.tyreWidth, ring.toothCount, sp.toothCount);
      const cells  = ratios.map(r => `<td>${(baseMD * r).toFixed(2)}</td>`).join('');
      html += `<tr><td>${ring.toothCount}t</td>${cells}</tr>`;
    }
    html += '</tbody></table></div>';

    // Speed
    html += `<h3 style="margin:1rem 0 0.5rem">Speed at ${cadence} rpm (km/h)</h3>
      <div class="gear-table-wrap"><table class="gear-table">
      <thead><tr><th>Ring</th>${gearHeaders}</tr></thead><tbody>`;
    for (const ring of rings) {
      const baseKMH = GearCalc.speedKMH(ws.rimBsd, ws.tyreWidth, ring.toothCount, sp.toothCount, cadence);
      const cells   = ratios.map(r => `<td>${(baseKMH * r).toFixed(1)}</td>`).join('');
      html += `<tr><td>${ring.toothCount}t</td>${cells}</tr>`;
    }
    html += '</tbody></table></div>';

    document.getElementById('calc-results').innerHTML = html;
    return;
  }

  // ── Cassette / Single-sided / Flip-flop ────────────────────────────────────
  let sprockets = [];
  if (hub.shape === HubShape.CASSETTE) {
    sprockets = hub.sprockets;
  } else if (hub.shape === HubShape.FLIP_FLOP) {
    sprockets = [hub.sideA, hub.sideB];
  } else if (hub.shape === HubShape.SINGLE_SIDED) {
    sprockets = [getActiveSprocket(hub)];
  }

  if (!sprockets.length) {
    document.getElementById('calc-results').innerHTML =
      '<p class="error-msg">No sprockets configured on this wheelset.</p>';
    return;
  }

  const headers = sprockets.map(s => `<th>${s.toothCount}t</th>`).join('');
  let html = `<h3 style="margin:1rem 0 0.5rem">Gear Inches</h3>
    <div class="gear-table-wrap"><table class="gear-table">
    <thead><tr><th>Ring</th>${headers}</tr></thead><tbody>`;

  for (const ring of rings) {
    const cells = sprockets.map(sp => {
      const gi = GearCalc.gearInches(ws.rimBsd, ws.tyreWidth, ring.toothCount, sp.toothCount);
      return `<td>${gi.toFixed(1)}</td>`;
    }).join('');
    html += `<tr><td>${ring.toothCount}t</td>${cells}</tr>`;
  }
  html += '</tbody></table></div>';

  html += `<h3 style="margin:1rem 0 0.5rem">Metres of Development</h3>
    <div class="gear-table-wrap"><table class="gear-table">
    <thead><tr><th>Ring</th>${headers}</tr></thead><tbody>`;

  for (const ring of rings) {
    const cells = sprockets.map(sp => {
      const md = GearCalc.metresDevelopment(ws.rimBsd, ws.tyreWidth, ring.toothCount, sp.toothCount);
      return `<td>${md.toFixed(2)}</td>`;
    }).join('');
    html += `<tr><td>${ring.toothCount}t</td>${cells}</tr>`;
  }
  html += '</tbody></table></div>';

  html += `<h3 style="margin:1rem 0 0.5rem">Speed at ${cadence} rpm (km/h)</h3>
    <div class="gear-table-wrap"><table class="gear-table">
    <thead><tr><th>Ring</th>${headers}</tr></thead><tbody>`;

  for (const ring of rings) {
    const cells = sprockets.map(sp => {
      const kmh = GearCalc.speedKMH(ws.rimBsd, ws.tyreWidth, ring.toothCount, sp.toothCount, cadence);
      return `<td>${kmh.toFixed(1)}</td>`;
    }).join('');
    html += `<tr><td>${ring.toothCount}t</td>${cells}</tr>`;
  }
  html += '</tbody></table></div>';

  if (isFixedDrivetrain(hub)) {
    const activeSprocket = getActiveSprocket(hub);
    html += `<h3 style="margin:1rem 0 0.5rem">Skid Patches</h3>
      <div class="gear-table-wrap"><table class="gear-table">
      <thead><tr><th>Ring</th><th>${activeSprocket.toothCount}t</th></tr></thead><tbody>`;
    for (const ring of rings) {
      const patches = GearCalc.skidPatches(ring.toothCount, activeSprocket.toothCount);
      html += `<tr><td>${ring.toothCount}t</td><td>${patches}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  document.getElementById('calc-results').innerHTML = html;
}

function renderCalcResultsFromPool(bike, ws, cadence) {
  const chainRings = [...bike.chainRingPool].sort((a, b) => a - b);

  // Deduplicate sprocket pool by tooth count
  const sprockets = bike.sprocketPool
    .filter((s, i, arr) => arr.findIndex(x => x.toothCount === s.toothCount) === i)
    .sort((a, b) => a.toothCount - b.toothCount);

  const isFittedCell = (ringT, spT) =>
    bike.fittedChainRing === ringT && bike.fittedSprockets.includes(spT);

  const ringLabel = t =>
    `${t}t${bike.fittedChainRing === t ? ' &#9733;' : ''}`;

  const cell = (val, ringT, spT) =>
    `<td${isFittedCell(ringT, spT) ? ' class="cell-fitted"' : ''}>${val}</td>`;

  const headers = sprockets.map(s =>
    `<th>${s.toothCount}t${bike.fittedSprockets.includes(s.toothCount) ? ' &#9733;' : ''}</th>`
  ).join('');

  // Gear Inches
  let html = `<h3 style="margin:1rem 0 0.5rem">Gear Inches</h3>
    <div class="gear-table-wrap"><table class="gear-table">
    <thead><tr><th>Ring</th>${headers}</tr></thead><tbody>`;
  for (const t of chainRings) {
    const cells = sprockets.map(sp =>
      cell(GearCalc.gearInches(ws.rimBsd, ws.tyreWidth, t, sp.toothCount).toFixed(1), t, sp.toothCount)
    ).join('');
    html += `<tr><td>${ringLabel(t)}</td>${cells}</tr>`;
  }
  html += '</tbody></table></div>';

  // Metres of Development
  html += `<h3 style="margin:1rem 0 0.5rem">Metres of Development</h3>
    <div class="gear-table-wrap"><table class="gear-table">
    <thead><tr><th>Ring</th>${headers}</tr></thead><tbody>`;
  for (const t of chainRings) {
    const cells = sprockets.map(sp =>
      cell(GearCalc.metresDevelopment(ws.rimBsd, ws.tyreWidth, t, sp.toothCount).toFixed(2), t, sp.toothCount)
    ).join('');
    html += `<tr><td>${ringLabel(t)}</td>${cells}</tr>`;
  }
  html += '</tbody></table></div>';

  // Speed
  html += `<h3 style="margin:1rem 0 0.5rem">Speed at ${cadence} rpm (km/h)</h3>
    <div class="gear-table-wrap"><table class="gear-table">
    <thead><tr><th>Ring</th>${headers}</tr></thead><tbody>`;
  for (const t of chainRings) {
    const cells = sprockets.map(sp =>
      cell(GearCalc.speedKMH(ws.rimBsd, ws.tyreWidth, t, sp.toothCount, cadence).toFixed(1), t, sp.toothCount)
    ).join('');
    html += `<tr><td>${ringLabel(t)}</td>${cells}</tr>`;
  }
  html += '</tbody></table></div>';

  // Skid patches — fixed sprockets only
  const fixedSprockets = sprockets.filter(s => s.isFixed);
  if (fixedSprockets.length) {
    const fixedHeaders = fixedSprockets.map(s =>
      `<th>${s.toothCount}t${bike.fittedSprockets.includes(s.toothCount) ? ' &#9733;' : ''}</th>`
    ).join('');
    html += `<h3 style="margin:1rem 0 0.5rem">Skid Patches</h3>
      <div class="gear-table-wrap"><table class="gear-table">
      <thead><tr><th>Ring</th>${fixedHeaders}</tr></thead><tbody>`;
    for (const t of chainRings) {
      const cells = fixedSprockets.map(sp =>
        cell(GearCalc.skidPatches(t, sp.toothCount), t, sp.toothCount)
      ).join('');
      html += `<tr><td>${ringLabel(t)}</td>${cells}</tr>`;
    }
    html += '</tbody></table></div>';
  }

  document.getElementById('calc-results').innerHTML = html;
}

// ── View: Library ─────────────────────────────────────────────────────────────

function renderLibraryView() {
  const s = AppState.stable;

  // Rims: merge built-in + custom, tag each with its custom index, sort descending by BSD
  const rimEntries = [
    ...RimLibrary.map(r => ({ ...r, customIdx: null })),
    ...(s.customRims || []).map((r, i) => ({ ...r, customIdx: i })),
  ].sort((a, b) => b.bsd - a.bsd);

  // Tyres: merge + sort descending by width
  const tyreEntries = [
    ...TyreLibrary.map(t => ({ ...t, customIdx: null })),
    ...(s.customTyres || []).map((t, i) => ({ ...t, customIdx: i })),
  ].sort((a, b) => a.width - b.width);

  // Cranks: merge + sort ascending by length
  const crankEntries = [
    ...CrankLengths.map(c => ({ ...c, customIdx: null })),
    ...(s.customCranks || []).map((c, i) => ({ ...c, customIdx: i })),
  ].sort((a, b) => a.microns - b.microns);

  function libItem(label, value, action, customIdx) {
    const del = customIdx !== null
      ? `<button class="btn-sm danger lib-del" data-action="${action}" data-idx="${customIdx}">&#x2715;</button>`
      : '';
    return `<li class="library-item">
      <span>${escHtml(label)}</span>
      <div class="item-end"><span class="item-value">${value}</span>${del}</div>
    </li>`;
  }

  const rimItems   = rimEntries.map(r =>
    libItem(r.name, `${(r.bsd / 1000).toFixed(0)} mm BSD`, 'del-rim', r.customIdx)).join('');
  const tyreItems  = tyreEntries.map(t =>
    libItem(t.name, `${(t.width / 1000).toFixed(1)} mm`, 'del-tyre', t.customIdx)).join('');
  const crankItems = crankEntries.map(c =>
    libItem(c.name, `${(c.microns / 1000).toFixed(1)} mm`, 'del-crank', c.customIdx)).join('');

  const addForm = (id, fields) =>
    `<div id="${id}" class="library-add-form" hidden>
      ${fields}
      <div class="library-add-actions">
        <button class="btn-secondary lib-cancel">Cancel</button>
        <button class="btn-primary lib-save">Add</button>
      </div>
    </div>`;

  function section(heading, bodyId, addBtnTarget, items, form) {
    const collapsed = libraryCollapsed[bodyId];
    return `<div class="library-section">
      <div class="library-section-header">
        <h2 class="lib-collapse-btn${collapsed ? ' is-collapsed' : ''}" data-body="${bodyId}">
          <span class="lib-chevron">&#9660;</span>${heading}
        </h2>
        <button class="btn-sm lib-toggle" data-target="${addBtnTarget}">+ Add</button>
      </div>
      <div class="lib-section-body" id="${bodyId}"${collapsed ? ' hidden' : ''}>
        <ul class="library-list">${items}</ul>
        ${form}
      </div>
    </div>`;
  }

  return section('Rim sizes',    'rim-body',   'add-rim-form',
    rimItems,   addForm('add-rim-form', `
      <div class="form-row"><label>Name</label><input id="rim-name" type="text" placeholder="e.g. 550c" autocomplete="off"></div>
      <div class="form-row"><label>BSD (mm)</label><input id="rim-bsd" type="number" placeholder="e.g. 550" inputmode="decimal" step="0.1"></div>`))
  + section('Tyre widths',   'tyre-body',  'add-tyre-form',
    tyreItems,  addForm('add-tyre-form', `
      <div class="form-row"><label>Name</label><input id="tyre-name" type="text" placeholder="e.g. 42mm" autocomplete="off"></div>
      <div class="form-row"><label>Width (mm)</label><input id="tyre-width" type="number" placeholder="e.g. 42" inputmode="decimal" step="0.1"></div>`))
  + section('Crank lengths', 'crank-body', 'add-crank-form',
    crankItems, addForm('add-crank-form', `
      <div class="form-row"><label>Name</label><input id="crank-name" type="text" placeholder="e.g. 167.5mm" autocomplete="off"></div>
      <div class="form-row"><label>Length (mm)</label><input id="crank-len" type="number" placeholder="e.g. 167.5" inputmode="decimal" step="0.5"></div>`))
  + `<aside class="help-text">
      <p>The library holds the rim sizes, tyre widths, and crank lengths available when building bikes and wheelsets. Built-in entries cover the most common standards and cannot be deleted.</p>
      <p>Add custom entries for less common sizes — they appear alongside the built-in list and can be removed at any time.</p>
    </aside>`;
}

function wireLibraryEvents() {
  // Collapse / expand sections
  document.querySelectorAll('.lib-collapse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const bodyId   = btn.dataset.body;
      const body     = document.getElementById(bodyId);
      const collapse = !body.hidden;
      body.hidden    = collapse;
      btn.classList.toggle('is-collapsed', collapse);
      libraryCollapsed[bodyId] = collapse;
    });
  });

  // Toggle add forms — wire directly to each button (avoids stacking listeners)
  document.querySelectorAll('.lib-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(btn.dataset.target);
      if (form) form.hidden = !form.hidden;
    });
  });

  // Cancel buttons
  document.querySelectorAll('.lib-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.library-add-form').hidden = true;
    });
  });

  // Save buttons
  document.querySelectorAll('.lib-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const form = btn.closest('.library-add-form');
      const s    = AppState.stable;

      if (form.id === 'add-rim-form') {
        const name = document.getElementById('rim-name').value.trim();
        const bsd  = parseFloat(document.getElementById('rim-bsd').value);
        if (!name || !(bsd > 0)) { alert('Please enter a name and a valid BSD.'); return; }
        s.customRims.push({ name, bsd: Math.round(bsd * 1000) });
      } else if (form.id === 'add-tyre-form') {
        const name  = document.getElementById('tyre-name').value.trim();
        const width = parseFloat(document.getElementById('tyre-width').value);
        if (!name || !(width > 0)) { alert('Please enter a name and a valid width.'); return; }
        s.customTyres.push({ name, width: Math.round(width * 1000) });
      } else if (form.id === 'add-crank-form') {
        const name  = document.getElementById('crank-name').value.trim();
        const lenMm = parseFloat(document.getElementById('crank-len').value);
        if (!name || !(lenMm > 0)) { alert('Please enter a name and a valid length.'); return; }
        s.customCranks.push({ name, microns: Math.round(lenMm * 1000) });
      }

      await DB.save(s);
      showView('library');
    });
  });

  // Delete custom entries
  document.querySelectorAll('.lib-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const idx    = parseInt(btn.dataset.idx, 10);
      const s      = AppState.stable;
      if      (action === 'del-rim')   s.customRims.splice(idx, 1);
      else if (action === 'del-tyre')  s.customTyres.splice(idx, 1);
      else if (action === 'del-crank') s.customCranks.splice(idx, 1);
      await DB.save(s);
      showView('library');
    });
  });
}

// ── Add Bike flow ─────────────────────────────────────────────────────────────

function showAddBikeForm() {
  document.getElementById('page-title').textContent = 'Add Bike';
  document.getElementById('main-content').innerHTML = renderAddBikeForm(AppState.stable);
  wireAddBikeForm(
    AppState.stable,
    async bike => {
      AppState.stable.bicycles.push(bike);
      await DB.save(AppState.stable);
      stableSubTab = 'bikes';
      showView('stable');
    },
    () => showView('stable')
  );
}

// ── Add Wheelset flow ─────────────────────────────────────────────────────────

function showAddWheelsetForm() {
  document.getElementById('page-title').textContent = 'Add Wheelset';
  document.getElementById('main-content').innerHTML = renderAddWheelsetForm(AppState.stable);
  wireAddWheelsetForm(
    AppState.stable,
    async wheelset => {
      AppState.stable.wheelsets.push(wheelset);
      await DB.save(AppState.stable);
      stableSubTab = 'wheelsets';
      showView('stable');
    },
    () => showView('stable')
  );
}

// ── Bike detail view ──────────────────────────────────────────────────────────

function renderPoolSection(bike) {
  if (bike.shifterType !== ShifterType.NONE) return '';

  const ws       = getActiveWheelset(bike, AppState.stable);
  const isFF     = ws?.hub?.shape === HubShape.FLIP_FLOP;
  const maxFit   = isFF ? 2 : 1;

  const crItems = [...bike.chainRingPool].sort((a, b) => a - b).map(t => {
    const fitted = bike.fittedChainRing === t;
    return `<li class="pool-item${fitted ? ' pool-fitted' : ''}">
      <span>${t}t${fitted ? ' <span class="badge-active">Fitted</span>' : ''}</span>
      <div class="wheelset-row-actions">
        ${!fitted ? `<button class="btn-sm" data-action="fit-chainring" data-teeth="${t}">Fit</button>` : ''}
        <button class="btn-sm danger" data-action="del-chainring" data-teeth="${t}">&#x2715;</button>
      </div>
    </li>`;
  }).join('') || '<li class="pool-empty">No chainrings added yet.</li>';

  const spItems = [...bike.sprocketPool]
    .sort((a, b) => a.toothCount - b.toothCount)
    .filter((s, i, arr) => arr.findIndex(x => x.toothCount === s.toothCount) === i)
    .map(sp => {
      const fitted  = bike.fittedSprockets.includes(sp.toothCount);
      const canFit  = !fitted && bike.fittedSprockets.length < maxFit;
      return `<li class="pool-item${fitted ? ' pool-fitted' : ''}">
        <span>${sp.toothCount}t <span class="pool-tag">${sp.isFixed ? 'Fixed' : 'Freewheel'}</span>${fitted ? ' <span class="badge-active">Fitted</span>' : ''}</span>
        <div class="wheelset-row-actions">
          ${canFit  ? `<button class="btn-sm" data-action="fit-sprocket"   data-teeth="${sp.toothCount}">Fit</button>`   : ''}
          ${fitted  ? `<button class="btn-sm" data-action="unfit-sprocket" data-teeth="${sp.toothCount}">Unfit</button>` : ''}
          <button class="btn-sm danger" data-action="del-sprocket" data-teeth="${sp.toothCount}">&#x2715;</button>
        </div>
      </li>`;
    }).join('') || '<li class="pool-empty">No sprockets added yet.</li>';

  return `<div class="form-section">
    <h2>Parts pool</h2>

    <div class="pool-subsection">
      <div class="pool-subsection-header">
        <strong>Chainrings</strong>
        <button class="btn-sm" id="btn-add-cr">+ Add</button>
      </div>
      <ul class="pool-list">${crItems}</ul>
      <div id="add-cr-form" class="library-add-form" hidden>
        <div class="form-row">
          <label for="cr-teeth">Tooth count</label>
          <input id="cr-teeth" type="number" placeholder="e.g. 46" min="20" max="60" inputmode="numeric">
        </div>
        <div class="library-add-actions">
          <button class="btn-secondary" id="cancel-cr">Cancel</button>
          <button class="btn-primary"   id="save-cr">Add</button>
        </div>
      </div>
    </div>

    <div class="pool-subsection">
      <div class="pool-subsection-header">
        <strong>Sprockets</strong>
        <button class="btn-sm" id="btn-add-sp">+ Add</button>
      </div>
      <ul class="pool-list">${spItems}</ul>
      <div id="add-sp-form" class="library-add-form" hidden>
        <div class="form-row">
          <label for="sp-teeth">Tooth count</label>
          <input id="sp-teeth" type="number" placeholder="e.g. 16" min="8" max="60" inputmode="numeric">
        </div>
        <div class="form-row">
          <label>Type</label>
          <div class="radio-group">
            <label><input type="radio" name="sp-type" value="fixed" checked> Fixed</label>
            <label><input type="radio" name="sp-type" value="freewheel"> Freewheel</label>
          </div>
        </div>
        <div class="library-add-actions">
          <button class="btn-secondary" id="cancel-sp">Cancel</button>
          <button class="btn-primary"   id="save-sp">Add</button>
        </div>
      </div>
    </div>
  </div>`;
}

function showBikeDetail(bikeId) {
  const bike = AppState.stable.bicycles.find(b => b.id === bikeId);
  if (!bike) return;
  document.getElementById('page-title').textContent = bike.name;
  document.getElementById('main-content').innerHTML = renderBikeDetail(bike, AppState.stable);
  wireBikeDetail(bikeId);
}

function renderBikeDetail(bike, stable) {
  const shifterLabel = {
    [ShifterType.NONE]:     'No shifters',
    [ShifterType.GEARED]:   `Geared — ${bike.speeds}-speed`,
    [ShifterType.HUB_GEAR]: 'Hub gear (IGH)',
  }[bike.shifterType] || bike.shifterType;

  const crankMm = (bike.crankSet.crankLengthMicrons / 1000).toFixed(1);
  const rings   = bike.crankSet.chainRings.map(r => r.toothCount + 't').join(', ') || '—';

  // Assigned wheelsets (filter out any dangling IDs)
  const assigned = (bike.wheelsetIds || [])
    .map(id => stable.wheelsets.find(w => w.id === id))
    .filter(Boolean);

  const wsRows = assigned.length
    ? assigned.map(ws => {
        const isActive = ws.id === bike.activeWheelsetId;
        const rimMm  = (ws.rimBsd    / 1000).toFixed(0);
        const tyrMm  = (ws.tyreWidth / 1000).toFixed(1);
        return `<div class="wheelset-row${isActive ? ' is-active' : ''}">
          <div class="wheelset-row-info">
            <span class="wheelset-row-name">${escHtml(ws.name)}${isActive ? ' <span class="badge-active">Active</span>' : ''}</span>
            <span class="wheelset-row-meta">${escHtml(describeHub(ws.hub))} &middot; ${rimMm}/${tyrMm}mm</span>
          </div>
          <div class="wheelset-row-actions">
            ${!isActive ? `<button class="btn-sm" data-action="set-active" data-wsid="${ws.id}">Set active</button>` : ''}
            <button class="btn-sm danger" data-action="unassign" data-wsid="${ws.id}">Remove</button>
          </div>
        </div>`;
      }).join('')
    : '<p class="detail-empty">No wheelsets assigned.</p>';

  // Compatible wheelsets not yet assigned
  const available = stable.wheelsets.filter(
    w => !(bike.wheelsetIds || []).includes(w.id) && isWheelsetCompatible(bike, w)
  );

  const totalWheelsets = stable.wheelsets.length;
  let assignSection;
  if (available.length) {
    assignSection = `<button id="btn-assign-ws" class="btn-sm" style="margin-top:0.75rem">+ Assign wheelset</button>
       <div class="assign-picker" id="assign-picker" hidden>
         ${available.map(w => {
           const rimMm = (w.rimBsd    / 1000).toFixed(0);
           const tyrMm = (w.tyreWidth / 1000).toFixed(1);
           return `<div class="picker-item" data-action="assign" data-wsid="${w.id}">
             <span class="wheelset-row-name">${escHtml(w.name)}</span>
             <span class="wheelset-row-meta">${escHtml(describeHub(w.hub))} &middot; ${rimMm}/${tyrMm}mm</span>
           </div>`;
         }).join('')}
       </div>`;
  } else if (totalWheelsets === 0) {
    assignSection = '<p class="detail-empty" style="margin-top:0.5rem">No wheelsets in your stable yet. Go to Stable &rarr; Wheelsets to create one first.</p>';
  } else {
    assignSection = '<p class="detail-empty" style="margin-top:0.5rem">No compatible wheelsets available. Check that your wheelsets have a hub type that matches this bike\'s drivetrain.</p>';
  }

  return `<div class="detail-actions-bar">
      <button id="btn-back" class="btn-secondary">&#8592; Back</button>
      <button id="btn-edit-bike" class="btn-primary">Edit bike</button>
    </div>

    <div class="form-section">
      <h2>Drivetrain</h2>
      <div class="detail-row">
        <span class="detail-label">Shifters</span>
        <span>${escHtml(shifterLabel)}</span>
      </div>
    </div>

    <div class="form-section">
      <h2>Crankset</h2>
      <div class="detail-row">
        <span class="detail-label">Crank length</span>
        <span>${crankMm} mm</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Chainrings</span>
        <span>${escHtml(rings)}</span>
      </div>
    </div>

    <div class="form-section">
      <h2>Wheelsets</h2>
      ${wsRows}
      ${assignSection}
    </div>

    ${renderPoolSection(bike)}

    <div class="form-actions" style="justify-content:flex-start; padding-top:0.5rem">
      <button id="btn-delete-bike" class="btn-danger">Delete bike</button>
    </div>`;
}

function wireBikeDetail(bikeId) {
  // All listeners wired directly to rendered elements — no delegated listener
  // on #main-content, which would stack on re-render and double-fire.

  const bike = AppState.stable.bicycles.find(b => b.id === bikeId);
  if (!bike) return;

  const save = () => DB.save(AppState.stable);
  const refresh = () => showBikeDetail(bikeId);

  // ── Navigation ──────────────────────────────────────────────────────────
  document.getElementById('btn-back')?.addEventListener('click', () => {
    stableSubTab = 'bikes';
    showView('stable');
  });
  document.getElementById('btn-edit-bike')?.addEventListener('click', () => showEditBikeForm(bikeId));
  document.getElementById('btn-delete-bike')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${bike.name}"? This cannot be undone.`)) return;
    AppState.stable.bicycles = AppState.stable.bicycles.filter(b => b.id !== bikeId);
    await save(); stableSubTab = 'bikes'; showView('stable');
  });

  // ── Wheelset assign picker ──────────────────────────────────────────────
  document.getElementById('btn-assign-ws')?.addEventListener('click', () => {
    const picker = document.getElementById('assign-picker');
    if (picker) picker.hidden = !picker.hidden;
  });
  document.querySelectorAll('[data-action="set-active"]').forEach(btn =>
    btn.addEventListener('click', async () => {
      bike.activeWheelsetId = btn.dataset.wsid;
      await save(); refresh();
    }));
  document.querySelectorAll('[data-action="unassign"]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.wsid;
      bike.wheelsetIds = (bike.wheelsetIds || []).filter(w => w !== id);
      if (bike.activeWheelsetId === id) bike.activeWheelsetId = bike.wheelsetIds[0] ?? null;
      await save(); refresh();
    }));
  document.querySelectorAll('[data-action="assign"]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.wsid;
      if (!(bike.wheelsetIds || []).includes(id)) {
        bike.wheelsetIds = [...(bike.wheelsetIds || []), id];
        if (!bike.activeWheelsetId) bike.activeWheelsetId = id;
      }
      await save(); refresh();
    }));

  // ── Parts pool (NONE bikes only) ────────────────────────────────────────
  if (bike.shifterType === ShifterType.NONE) {
    const toggle = (btnId, formId) =>
      document.getElementById(btnId)?.addEventListener('click', () => {
        const f = document.getElementById(formId);
        if (f) f.hidden = !f.hidden;
      });

    toggle('btn-add-cr', 'add-cr-form');
    toggle('btn-add-sp', 'add-sp-form');

    document.getElementById('cancel-cr')?.addEventListener('click', () => {
      document.getElementById('add-cr-form').hidden = true;
    });
    document.getElementById('save-cr')?.addEventListener('click', async () => {
      const t = parseInt(document.getElementById('cr-teeth').value, 10);
      if (!(t > 0)) { alert('Please enter a valid tooth count.'); return; }
      if (!bike.chainRingPool.includes(t)) bike.chainRingPool.push(t);
      await save(); refresh();
    });

    document.getElementById('cancel-sp')?.addEventListener('click', () => {
      document.getElementById('add-sp-form').hidden = true;
    });
    document.getElementById('save-sp')?.addEventListener('click', async () => {
      const t       = parseInt(document.getElementById('sp-teeth').value, 10);
      const isFixed = document.querySelector('input[name="sp-type"]:checked')?.value === 'fixed';
      if (!(t > 0)) { alert('Please enter a valid tooth count.'); return; }
      if (!bike.sprocketPool.find(s => s.toothCount === t))
        bike.sprocketPool.push({ toothCount: t, isFixed });
      await save(); refresh();
    });

    document.querySelectorAll('[data-action="fit-chainring"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        bike.fittedChainRing = parseInt(btn.dataset.teeth, 10);
        await save(); refresh();
      }));
    document.querySelectorAll('[data-action="del-chainring"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const t = parseInt(btn.dataset.teeth, 10);
        bike.chainRingPool = bike.chainRingPool.filter(x => x !== t);
        if (bike.fittedChainRing === t) bike.fittedChainRing = bike.chainRingPool[0] ?? null;
        await save(); refresh();
      }));
    document.querySelectorAll('[data-action="fit-sprocket"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const t   = parseInt(btn.dataset.teeth, 10);
        const ws  = getActiveWheelset(bike, AppState.stable);
        const max = ws?.hub?.shape === HubShape.FLIP_FLOP ? 2 : 1;
        if (bike.fittedSprockets.length < max && !bike.fittedSprockets.includes(t))
          bike.fittedSprockets = [...bike.fittedSprockets, t];
        await save(); refresh();
      }));
    document.querySelectorAll('[data-action="unfit-sprocket"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        bike.fittedSprockets = bike.fittedSprockets.filter(x => x !== parseInt(btn.dataset.teeth, 10));
        await save(); refresh();
      }));
    document.querySelectorAll('[data-action="del-sprocket"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const t = parseInt(btn.dataset.teeth, 10);
        bike.sprocketPool    = bike.sprocketPool.filter(s => s.toothCount !== t);
        bike.fittedSprockets = bike.fittedSprockets.filter(x => x !== t);
        await save(); refresh();
      }));
  }
}

// ── Edit Bike flow ────────────────────────────────────────────────────────────

function showEditBikeForm(bikeId) {
  const bike = AppState.stable.bicycles.find(b => b.id === bikeId);
  if (!bike) return;
  document.getElementById('page-title').textContent = 'Edit Bike';
  document.getElementById('main-content').innerHTML = renderEditBikeForm(AppState.stable, bike);
  wireEditBikeForm(
    AppState.stable,
    bike,
    async updatedFields => {
      // Build a temporary updated bike to test wheelset compatibility
      const tempBike = { ...bike, ...updatedFields };
      const nowIncompatible = (bike.wheelsetIds || []).filter(id => {
        const ws = AppState.stable.wheelsets.find(w => w.id === id);
        return ws && !isWheelsetCompatible(tempBike, ws);
      });

      // Apply the updates
      Object.assign(bike, updatedFields);

      if (nowIncompatible.length) {
        bike.wheelsetIds = bike.wheelsetIds.filter(id => !nowIncompatible.includes(id));
        if (nowIncompatible.includes(bike.activeWheelsetId)) {
          bike.activeWheelsetId = bike.wheelsetIds[0] ?? null;
        }
        const names = nowIncompatible
          .map(id => AppState.stable.wheelsets.find(w => w.id === id)?.name ?? id)
          .join(', ');
        await DB.save(AppState.stable);
        alert(`The following wheelsets were unassigned as they are no longer compatible with the updated drivetrain:\n\n${names}\n\nThey remain in your wheelset pool and can be reassigned to a compatible bike.`);
      } else {
        await DB.save(AppState.stable);
      }

      showBikeDetail(bikeId);
    },
    () => showBikeDetail(bikeId)
  );
}

// ── Wheelset detail view ──────────────────────────────────────────────────────

function showWheelsetDetail(wheelsetId) {
  const ws = AppState.stable.wheelsets.find(w => w.id === wheelsetId);
  if (!ws) return;
  document.getElementById('page-title').textContent = ws.name;
  document.getElementById('main-content').innerHTML = renderWheelsetDetail(ws, AppState.stable);
  wireWheelsetDetail(wheelsetId);
}

function renderWheelsetDetail(ws, stable) {
  const rimMm  = (ws.rimBsd    / 1000).toFixed(0);
  const tyrMm  = (ws.tyreWidth / 1000).toFixed(1);

  // Bikes this wheelset is assigned to
  const assignedBikes = stable.bicycles.filter(b =>
    (b.wheelsetIds || []).includes(ws.id)
  );

  const bikeRows = assignedBikes.length
    ? assignedBikes.map(bike => {
        const isActive = bike.activeWheelsetId === ws.id;
        return `<div class="detail-row">
          <span>${escHtml(bike.name)}${isActive ? ' <span class="badge-active">Active</span>' : ''}</span>
        </div>`;
      }).join('')
    : '<p class="detail-empty">Not assigned to any bike.</p>';

  return `<div class="detail-actions-bar">
      <button id="btn-back" class="btn-secondary">&#8592; Back</button>
      <button id="btn-edit-ws" class="btn-primary">Edit wheelset</button>
    </div>

    <div class="form-section">
      <h2>Specification</h2>
      <div class="detail-row">
        <span class="detail-label">Rim BSD</span>
        <span>${rimMm} mm</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tyre width</span>
        <span>${tyrMm} mm</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Hub</span>
        <span>${escHtml(describeHub(ws.hub))}</span>
      </div>
    </div>

    <div class="form-section">
      <h2>Assigned to</h2>
      ${bikeRows}
    </div>

    <div class="form-actions" style="justify-content:flex-start; padding-top:0.5rem">
      <button id="btn-delete-ws" class="btn-danger">Delete wheelset</button>
    </div>`;
}

function wireWheelsetDetail(wheelsetId) {
  document.getElementById('btn-back')?.addEventListener('click', () => {
    stableSubTab = 'wheelsets';
    showView('stable');
  });

  document.getElementById('btn-edit-ws')?.addEventListener('click', () =>
    showEditWheelsetForm(wheelsetId));

  document.getElementById('btn-delete-ws')?.addEventListener('click', async () => {
    const ws = AppState.stable.wheelsets.find(w => w.id === wheelsetId);
    if (!ws) return;

    const assignedBikes = AppState.stable.bicycles.filter(b =>
      (b.wheelsetIds || []).includes(wheelsetId)
    );

    let confirmed;
    if (assignedBikes.length) {
      const names = assignedBikes.map(b => b.name).join(', ');
      confirmed = confirm(
        `"${ws.name}" is currently assigned to: ${names}.\n\nDeleting it will unassign it from those bikes. Continue?`
      );
    } else {
      confirmed = confirm(`Delete "${ws.name}"? This cannot be undone.`);
    }
    if (!confirmed) return;

    // Unassign from all bikes
    for (const bike of assignedBikes) {
      bike.wheelsetIds = bike.wheelsetIds.filter(id => id !== wheelsetId);
      if (bike.activeWheelsetId === wheelsetId) {
        bike.activeWheelsetId = bike.wheelsetIds[0] ?? null;
      }
    }
    AppState.stable.wheelsets = AppState.stable.wheelsets.filter(w => w.id !== wheelsetId);
    await DB.save(AppState.stable);
    stableSubTab = 'wheelsets';
    showView('stable');
  });
}

// ── Edit Wheelset flow ────────────────────────────────────────────────────────

function showEditWheelsetForm(wheelsetId) {
  const ws = AppState.stable.wheelsets.find(w => w.id === wheelsetId);
  if (!ws) return;
  document.getElementById('page-title').textContent = 'Edit Wheelset';
  document.getElementById('main-content').innerHTML = renderEditWheelsetForm(AppState.stable, ws);
  wireEditWheelsetForm(
    AppState.stable,
    ws,
    async updatedWs => {
      // Check which currently-assigned bikes become incompatible with the new hub
      const assignedBikes = AppState.stable.bicycles.filter(b =>
        (b.wheelsetIds || []).includes(wheelsetId)
      );
      const nowIncompatible = assignedBikes.filter(b =>
        !isWheelsetCompatible(b, updatedWs)
      );

      // Apply the update in-place (preserve the same ID)
      Object.assign(ws, updatedWs, { id: wheelsetId });

      if (nowIncompatible.length) {
        for (const bike of nowIncompatible) {
          bike.wheelsetIds = bike.wheelsetIds.filter(id => id !== wheelsetId);
          if (bike.activeWheelsetId === wheelsetId) {
            bike.activeWheelsetId = bike.wheelsetIds[0] ?? null;
          }
        }
        const names = nowIncompatible.map(b => b.name).join(', ');
        await DB.save(AppState.stable);
        alert(`This wheelset was unassigned from the following bikes as it is no longer compatible with their drivetrain:\n\n${names}`);
      } else {
        await DB.save(AppState.stable);
      }

      showWheelsetDetail(wheelsetId);
    },
    () => showWheelsetDetail(wheelsetId)
  );
}

// ── Navigation ────────────────────────────────────────────────────────────────

const viewConfig = {
  stable:     { title: 'My Stable',  render: renderStableView,     wire: wireStableEvents },
  calculator: { title: 'Calculator', render: renderCalculatorView, wire: wireCalculatorEvents },
  library:    { title: 'Library',    render: renderLibraryView,    wire: wireLibraryEvents },
};

let currentView = 'stable';

function showView(name) {
  const cfg = viewConfig[name];
  if (!cfg) return;
  currentView = name;

  document.getElementById('page-title').textContent = cfg.title;
  document.getElementById('main-content').innerHTML = cfg.render();

  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));

  cfg.wire?.();
}

// ── Import / Export ───────────────────────────────────────────────────────────

async function handleImport(file) {
  try {
    const data = await DB.importJSON(file);
    if (!data || typeof data !== 'object' || !Array.isArray(data.bicycles)) {
      throw new Error('File does not appear to be a valid Stable export.');
    }
    // Migrate fields added after initial release
    if (!Array.isArray(data.wheelsets))    data.wheelsets    = [];
    if (!Array.isArray(data.customCranks)) data.customCranks = [];
    AppState.stable = data;
    migrateNoneBikePools(AppState.stable);
    await DB.save(AppState.stable);
    stableSubTab = 'bikes';
    showView('stable');
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function init() {
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => showView(btn.dataset.view)));

  document.getElementById('btn-export')
    ?.addEventListener('click', () => DB.exportJSON(AppState.stable));

  document.getElementById('btn-import')
    ?.addEventListener('change', e => {
      if (e.target.files[0]) handleImport(e.target.files[0]);
      e.target.value = '';
    });

  const saved = await DB.load();
  // Migrate stables saved before these fields were added
  if (saved && !Array.isArray(saved.wheelsets))    saved.wheelsets    = [];
  if (saved && !Array.isArray(saved.customCranks)) saved.customCranks = [];
  AppState.stable = saved || makeStable();
  if (saved) migrateNoneBikePools(AppState.stable);
  if (!saved) await DB.save(AppState.stable);

  showView('stable');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  }
}

document.addEventListener('DOMContentLoaded', init);
