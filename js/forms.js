// forms.js
// Add Bike and Add Wheelset forms: rendering, field wiring, domain object construction.

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIntList(str) {
  return str.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0);
}

function parseFloatList(str) {
  return str.split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0);
}

function radioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

// ── Add Bike form ─────────────────────────────────────────────────────────────

function renderAddBikeForm(stable) {
  const crankOptions = getCrankLibrary(stable).map(c =>
    `<option value="${c.microns}" ${c.microns === 172500 ? 'selected' : ''}>${escHtml(c.name)}</option>`
  ).join('');

  return `<form id="add-bike-form" novalidate>

    <div class="form-section">
      <h2>Bike</h2>
      <div class="form-row">
        <label for="bike-name">Name</label>
        <input id="bike-name" type="text" placeholder="e.g. My Track Bike" autocomplete="off">
      </div>
      <div class="form-row">
        <label for="bike-shifter">Shifter type</label>
        <select id="bike-shifter">
          <option value="none">No shifters (track / fixie / single-speed)</option>
          <option value="geared">Geared (derailleur)</option>
          <option value="hubGear">Hub gear (IGH)</option>
        </select>
      </div>
      <div class="form-row" id="row-speeds" hidden>
        <label for="bike-speeds">Speeds</label>
        <select id="bike-speeds">
          <option value="7">7-speed</option>
          <option value="8">8-speed</option>
          <option value="9">9-speed</option>
          <option value="10">10-speed</option>
          <option value="11" selected>11-speed</option>
          <option value="12">12-speed</option>
        </select>
      </div>
    </div>

    <div class="form-section">
      <h2>Crankset</h2>
      <div class="form-row">
        <label for="crank-length">Crank length</label>
        <select id="crank-length">${crankOptions}</select>
      </div>
      <div class="form-row">
        <label for="chainrings">Chainrings</label>
        <input id="chainrings" type="text" placeholder="e.g. 50,34 or 46" inputmode="numeric" autocomplete="off">
        <span class="form-hint">Tooth counts, comma-separated</span>
      </div>
    </div>

    <div id="form-error" class="error-msg" hidden></div>

    <div class="form-actions">
      <button type="button" id="btn-cancel-bike" class="btn-secondary">Cancel</button>
      <button type="submit" class="btn-primary">Save Bike</button>
    </div>

  </form>`;
}

function buildBikeFromForm(stable) {
  showFormError('');

  const name       = document.getElementById('bike-name').value.trim();
  const shifterRaw = document.getElementById('bike-shifter').value;
  const crankLen   = parseInt(document.getElementById('crank-length').value, 10);
  const ringsRaw   = document.getElementById('chainrings').value;

  if (!name) { showFormError('Please enter a bike name.'); return null; }

  const chainRings = parseIntList(ringsRaw);
  if (!chainRings.length) { showFormError('Please enter at least one chainring tooth count.'); return null; }

  const shifterMap  = { none: ShifterType.NONE, geared: ShifterType.GEARED, hubGear: ShifterType.HUB_GEAR };
  const shifterType = shifterMap[shifterRaw];
  const speeds      = shifterRaw === 'geared'
    ? parseInt(document.getElementById('bike-speeds').value, 10)
    : null;

  const crankSet = makeCrankSet({
    crankLengthMicrons: crankLen,
    chainRings: chainRings.map(t => ({ toothCount: t, name: t + 't', bcd: 0 })),
  });

  return makeBicycle({ name, shifterType, speeds, crankSet });
}

function wireAddBikeForm(stable, onSave, onCancel) {
  const updateVisibility = () => {
    const shifter = document.getElementById('bike-shifter')?.value;
    document.getElementById('row-speeds').hidden = shifter !== 'geared';
  };

  updateVisibility();
  document.getElementById('bike-shifter')?.addEventListener('change', updateVisibility);
  document.getElementById('btn-cancel-bike')?.addEventListener('click', onCancel);
  document.getElementById('add-bike-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const bike = buildBikeFromForm(stable);
    if (bike) onSave(bike);
  });
}

// ── Edit Bike form ────────────────────────────────────────────────────────────

function renderEditBikeForm(stable, bike) {
  const shifterRaw = {
    [ShifterType.NONE]:     'none',
    [ShifterType.GEARED]:   'geared',
    [ShifterType.HUB_GEAR]: 'hubGear',
  }[bike.shifterType] || 'none';

  const crankOptions = getCrankLibrary(stable).map(c =>
    `<option value="${c.microns}" ${c.microns === bike.crankSet.crankLengthMicrons ? 'selected' : ''}>${escHtml(c.name)}</option>`
  ).join('');

  const rings = bike.crankSet.chainRings.map(r => r.toothCount).join(', ');

  const speedOptions = [7,8,9,10,11,12].map(n =>
    `<option value="${n}" ${bike.speeds === n ? 'selected' : ''}>${n}-speed</option>`
  ).join('');

  return `<form id="edit-bike-form" novalidate>

    <div class="form-section">
      <h2>Bike</h2>
      <div class="form-row">
        <label for="bike-name">Name</label>
        <input id="bike-name" type="text" value="${escHtml(bike.name)}" autocomplete="off">
      </div>
      <div class="form-row">
        <label for="bike-shifter">Shifter type</label>
        <select id="bike-shifter">
          <option value="none"    ${shifterRaw === 'none'    ? 'selected' : ''}>No shifters (track / fixie / single-speed)</option>
          <option value="geared"  ${shifterRaw === 'geared'  ? 'selected' : ''}>Geared (derailleur)</option>
          <option value="hubGear" ${shifterRaw === 'hubGear' ? 'selected' : ''}>Hub gear (IGH)</option>
        </select>
      </div>
      <div class="form-row" id="row-speeds" ${shifterRaw !== 'geared' ? 'hidden' : ''}>
        <label for="bike-speeds">Speeds</label>
        <select id="bike-speeds">${speedOptions}</select>
      </div>
    </div>

    <div class="form-section">
      <h2>Crankset</h2>
      <div class="form-row">
        <label for="crank-length">Crank length</label>
        <select id="crank-length">${crankOptions}</select>
      </div>
      <div class="form-row">
        <label for="chainrings">Chainrings</label>
        <input id="chainrings" type="text" value="${escHtml(rings)}" inputmode="numeric" autocomplete="off">
        <span class="form-hint">Tooth counts, comma-separated</span>
      </div>
    </div>

    <div id="form-error" class="error-msg" hidden></div>

    <div class="form-actions">
      <button type="button" id="btn-cancel-edit" class="btn-secondary">Cancel</button>
      <button type="submit" class="btn-primary">Save Changes</button>
    </div>

  </form>`;
}

// Returns a plain object of updated fields, or null on validation failure.
function buildEditedBikeFields() {
  showFormError('');

  const name       = document.getElementById('bike-name').value.trim();
  const shifterRaw = document.getElementById('bike-shifter').value;
  const crankLen   = parseInt(document.getElementById('crank-length').value, 10);
  const ringsRaw   = document.getElementById('chainrings').value;

  if (!name) { showFormError('Please enter a bike name.'); return null; }

  const chainRings = parseIntList(ringsRaw);
  if (!chainRings.length) { showFormError('Please enter at least one chainring tooth count.'); return null; }

  const shifterMap  = { none: ShifterType.NONE, geared: ShifterType.GEARED, hubGear: ShifterType.HUB_GEAR };
  const shifterType = shifterMap[shifterRaw];
  const speeds      = shifterRaw === 'geared'
    ? parseInt(document.getElementById('bike-speeds').value, 10)
    : null;

  return {
    name,
    shifterType,
    speeds,
    crankSet: makeCrankSet({
      crankLengthMicrons: crankLen,
      chainRings: chainRings.map(t => ({ toothCount: t, name: t + 't', bcd: 0 })),
    }),
  };
}

function wireEditBikeForm(stable, bike, onSave, onCancel) {
  const updateVisibility = () => {
    const shifter = document.getElementById('bike-shifter')?.value;
    document.getElementById('row-speeds').hidden = shifter !== 'geared';
  };

  updateVisibility();
  document.getElementById('bike-shifter')?.addEventListener('change', updateVisibility);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', onCancel);
  document.getElementById('edit-bike-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const fields = buildEditedBikeFields();
    if (fields) onSave(fields);
  });
}

// ── Add Wheelset form ─────────────────────────────────────────────────────────

// ── Edit Wheelset form ────────────────────────────────────────────────────────

function renderEditWheelsetForm(stable, ws) {
  const rimOptions = getRimLibrary(stable).map((r, i) =>
    `<option value="${i}" ${r.bsd === ws.rimBsd ? 'selected' : ''}>${escHtml(r.name)}</option>`
  ).join('');

  const tyreOptions = getTyreLibrary(stable).map((t, i) =>
    `<option value="${i}" ${t.width === ws.tyreWidth ? 'selected' : ''}>${escHtml(t.name)}</option>`
  ).join('');

  const hub      = ws.hub;
  const hubType  = hub.shape;   // matches HubShape values which match the select option values

  // Pre-fill values per hub type
  const ssTeeth   = hubType === HubShape.SINGLE_SIDED ? hub.sprocket.toothCount : 16;
  const ssFixed   = hubType === HubShape.SINGLE_SIDED ? hub.sprocket.isFixed : true;
  const ffATeeth  = hubType === HubShape.FLIP_FLOP ? hub.sideA.toothCount : 16;
  const ffAFixed  = hubType === HubShape.FLIP_FLOP ? hub.sideA.isFixed : true;
  const ffBTeeth  = hubType === HubShape.FLIP_FLOP ? hub.sideB.toothCount : 18;
  const ffBFixed  = hubType === HubShape.FLIP_FLOP ? hub.sideB.isFixed : true;
  const ffActive  = hubType === HubShape.FLIP_FLOP ? hub.activeSide : 'A';
  const casSpds   = hubType === HubShape.CASSETTE   ? hub.speedCount : 11;
  const casSprk   = hubType === HubShape.CASSETTE   ? hub.sprockets.map(s => s.toothCount).join(', ') : '';
  const ighTeeth  = hubType === HubShape.HUB_GEAR   ? hub.sprocket.toothCount : 21;
  const ighRatios = hubType === HubShape.HUB_GEAR   ? hub.ratios.join(', ') : '';

  const hubSelectOptions = [
    { value: HubShape.SINGLE_SIDED, label: 'Single-sided' },
    { value: HubShape.FLIP_FLOP,    label: 'Flip-flop' },
    { value: HubShape.CASSETTE,     label: 'N-speed cassette' },
    { value: HubShape.HUB_GEAR,     label: 'Hub gear (IGH)' },
  ].map(o => `<option value="${o.value}" ${o.value === hubType ? 'selected' : ''}>${o.label}</option>`).join('');

  const speedOptions = [7,8,9,10,11,12].map(n =>
    `<option value="${n}" ${n === casSpds ? 'selected' : ''}>${n}-speed</option>`
  ).join('');

  return `<form id="edit-wheelset-form" novalidate>

    <div class="form-section">
      <h2>Wheelset</h2>
      <div class="form-row">
        <label for="ws-name">Name</label>
        <input id="ws-name" type="text" value="${escHtml(ws.name)}" autocomplete="off">
      </div>
      <div class="form-row">
        <label for="ws-rim">Rim</label>
        <select id="ws-rim">${rimOptions}</select>
      </div>
      <div class="form-row">
        <label for="ws-tyre">Tyre</label>
        <select id="ws-tyre">${tyreOptions}</select>
      </div>
      <div class="form-row">
        <label for="ws-hub-type">Hub type</label>
        <select id="ws-hub-type">${hubSelectOptions}</select>
      </div>
    </div>

    <div id="hub-singlesided" class="form-section" ${hubType !== HubShape.SINGLE_SIDED ? 'hidden' : ''}>
      <h2>Single-sided Hub</h2>
      <div class="form-row">
        <label for="ss-teeth">Sprocket teeth</label>
        <input id="ss-teeth" type="number" value="${ssTeeth}" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label>Sprocket type</label>
        <div class="radio-group">
          <label><input type="radio" name="ss-type" value="fixed" ${ssFixed ? 'checked' : ''}> Fixed</label>
          <label><input type="radio" name="ss-type" value="freewheel" ${!ssFixed ? 'checked' : ''}> Freewheel</label>
        </div>
      </div>
    </div>

    <div id="hub-flipflop" class="form-section" ${hubType !== HubShape.FLIP_FLOP ? 'hidden' : ''}>
      <h2>Flip-flop Hub</h2>
      <div class="form-row">
        <label for="ff-a-teeth">Side A teeth</label>
        <input id="ff-a-teeth" type="number" value="${ffATeeth}" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label>Side A type</label>
        <div class="radio-group">
          <label><input type="radio" name="ff-a-type" value="fixed" ${ffAFixed ? 'checked' : ''}> Fixed</label>
          <label><input type="radio" name="ff-a-type" value="freewheel" ${!ffAFixed ? 'checked' : ''}> Freewheel</label>
        </div>
      </div>
      <div class="form-row">
        <label for="ff-b-teeth">Side B teeth</label>
        <input id="ff-b-teeth" type="number" value="${ffBTeeth}" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label>Side B type</label>
        <div class="radio-group">
          <label><input type="radio" name="ff-b-type" value="fixed" ${ffBFixed ? 'checked' : ''}> Fixed</label>
          <label><input type="radio" name="ff-b-type" value="freewheel" ${!ffBFixed ? 'checked' : ''}> Freewheel</label>
        </div>
      </div>
      <div class="form-row">
        <label>Active side</label>
        <div class="radio-group">
          <label><input type="radio" name="ff-active" value="A" ${ffActive === 'A' ? 'checked' : ''}> A</label>
          <label><input type="radio" name="ff-active" value="B" ${ffActive === 'B' ? 'checked' : ''}> B</label>
        </div>
      </div>
    </div>

    <div id="hub-cassette" class="form-section" ${hubType !== HubShape.CASSETTE ? 'hidden' : ''}>
      <h2>Cassette Hub</h2>
      <div class="form-row">
        <label for="cassette-speeds">Speeds</label>
        <select id="cassette-speeds">${speedOptions}</select>
      </div>
      <div class="form-row">
        <label for="cassette-sprockets">Sprockets</label>
        <input id="cassette-sprockets" type="text" value="${escHtml(casSprk)}"
          placeholder="e.g. 11,13,15,17,19,21,23,25,28,32" inputmode="numeric" autocomplete="off">
        <span class="form-hint">Tooth counts, comma-separated</span>
      </div>
    </div>

    <div id="hub-hubgear" class="form-section" ${hubType !== HubShape.HUB_GEAR ? 'hidden' : ''}>
      <h2>Hub Gear (IGH)</h2>
      <div class="form-row">
        <label for="igh-teeth">Sprocket teeth</label>
        <input id="igh-teeth" type="number" value="${ighTeeth}" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label for="igh-ratios">Gear ratios</label>
        <input id="igh-ratios" type="text" value="${escHtml(ighRatios)}"
          placeholder="e.g. 0.527,0.681,0.878,0.995,1.134,1.292,1.462,1.667,1.888,2.153"
          inputmode="decimal" autocomplete="off">
        <span class="form-hint">Comma-separated, any order</span>
      </div>
    </div>

    <div id="form-error" class="error-msg" hidden></div>

    <div class="form-actions">
      <button type="button" id="btn-cancel-edit-ws" class="btn-secondary">Cancel</button>
      <button type="submit" class="btn-primary">Save Changes</button>
    </div>

  </form>`;
}

function wireEditWheelsetForm(stable, ws, onSave, onCancel) {
  updateWheelsetHubFields();
  document.getElementById('ws-hub-type')?.addEventListener('change', updateWheelsetHubFields);
  document.getElementById('btn-cancel-edit-ws')?.addEventListener('click', onCancel);
  document.getElementById('edit-wheelset-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const updated = buildWheelsetFromForm(stable);
    if (updated) onSave(updated);
  });
}

// ── Add Wheelset form ─────────────────────────────────────────────────────────

function renderAddWheelsetForm(stable) {
  const rimOptions = getRimLibrary(stable).map((r, i) =>
    `<option value="${i}" ${r.bsd === 622000 ? 'selected' : ''}>${escHtml(r.name)}</option>`
  ).join('');

  const tyreOptions = getTyreLibrary(stable).map((t, i) =>
    `<option value="${i}" ${t.width === 25000 ? 'selected' : ''}>${escHtml(t.name)}</option>`
  ).join('');

  return `<form id="add-wheelset-form" novalidate>

    <div class="form-section">
      <h2>Wheelset</h2>
      <div class="form-row">
        <label for="ws-name">Name</label>
        <input id="ws-name" type="text" placeholder="e.g. Race Wheels" autocomplete="off">
      </div>
      <div class="form-row">
        <label for="ws-rim">Rim</label>
        <select id="ws-rim">${rimOptions}</select>
      </div>
      <div class="form-row">
        <label for="ws-tyre">Tyre</label>
        <select id="ws-tyre">${tyreOptions}</select>
      </div>
      <div class="form-row">
        <label for="ws-hub-type">Hub type</label>
        <select id="ws-hub-type">
          <option value="singleSided">Single-sided</option>
          <option value="flipFlop">Flip-flop</option>
          <option value="cassette">N-speed cassette</option>
          <option value="hubGear">Hub gear (IGH)</option>
        </select>
      </div>
    </div>

    <div id="hub-singlesided" class="form-section">
      <h2>Single-sided Hub</h2>
      <div class="form-row">
        <label for="ss-teeth">Sprocket teeth</label>
        <input id="ss-teeth" type="number" value="16" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label>Sprocket type</label>
        <div class="radio-group">
          <label><input type="radio" name="ss-type" value="fixed" checked> Fixed</label>
          <label><input type="radio" name="ss-type" value="freewheel"> Freewheel</label>
        </div>
      </div>
    </div>

    <div id="hub-flipflop" class="form-section" hidden>
      <h2>Flip-flop Hub</h2>
      <div class="form-row">
        <label for="ff-a-teeth">Side A teeth</label>
        <input id="ff-a-teeth" type="number" value="16" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label>Side A type</label>
        <div class="radio-group">
          <label><input type="radio" name="ff-a-type" value="fixed" checked> Fixed</label>
          <label><input type="radio" name="ff-a-type" value="freewheel"> Freewheel</label>
        </div>
      </div>
      <div class="form-row">
        <label for="ff-b-teeth">Side B teeth</label>
        <input id="ff-b-teeth" type="number" value="18" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label>Side B type</label>
        <div class="radio-group">
          <label><input type="radio" name="ff-b-type" value="fixed" checked> Fixed</label>
          <label><input type="radio" name="ff-b-type" value="freewheel"> Freewheel</label>
        </div>
      </div>
      <div class="form-row">
        <label>Active side</label>
        <div class="radio-group">
          <label><input type="radio" name="ff-active" value="A" checked> A</label>
          <label><input type="radio" name="ff-active" value="B"> B</label>
        </div>
      </div>
    </div>

    <div id="hub-cassette" class="form-section" hidden>
      <h2>Cassette Hub</h2>
      <div class="form-row">
        <label for="cassette-speeds">Speeds</label>
        <select id="cassette-speeds">
          <option value="7">7-speed</option>
          <option value="8">8-speed</option>
          <option value="9">9-speed</option>
          <option value="10">10-speed</option>
          <option value="11" selected>11-speed</option>
          <option value="12">12-speed</option>
        </select>
      </div>
      <div class="form-row">
        <label for="cassette-sprockets">Sprockets</label>
        <input id="cassette-sprockets" type="text"
          placeholder="e.g. 11,13,15,17,19,21,23,25,28,32" inputmode="numeric" autocomplete="off">
        <span class="form-hint">Tooth counts, comma-separated</span>
      </div>
    </div>

    <div id="hub-hubgear" class="form-section" hidden>
      <h2>Hub Gear (IGH)</h2>
      <div class="form-row">
        <label for="igh-teeth">Sprocket teeth</label>
        <input id="igh-teeth" type="number" value="21" min="8" max="60" inputmode="numeric">
      </div>
      <div class="form-row">
        <label for="igh-ratios">Gear ratios</label>
        <input id="igh-ratios" type="text"
          placeholder="e.g. 0.527,0.681,0.878,0.995,1.134,1.292,1.462,1.667,1.888,2.153"
          inputmode="decimal" autocomplete="off">
        <span class="form-hint">Comma-separated, any order</span>
      </div>
    </div>

    <div id="form-error" class="error-msg" hidden></div>

    <div class="form-actions">
      <button type="button" id="btn-cancel-wheelset" class="btn-secondary">Cancel</button>
      <button type="submit" class="btn-primary">Save Wheelset</button>
    </div>

  </form>`;
}

function updateWheelsetHubFields() {
  const hubType = document.getElementById('ws-hub-type')?.value;
  document.getElementById('hub-singlesided').hidden = hubType !== 'singleSided';
  document.getElementById('hub-flipflop').hidden    = hubType !== 'flipFlop';
  document.getElementById('hub-cassette').hidden    = hubType !== 'cassette';
  document.getElementById('hub-hubgear').hidden     = hubType !== 'hubGear';
}

function buildWheelsetFromForm(stable) {
  showFormError('');

  const name    = document.getElementById('ws-name').value.trim() || 'Wheelset';
  const rimIdx  = parseInt(document.getElementById('ws-rim').value, 10);
  const tyreIdx = parseInt(document.getElementById('ws-tyre').value, 10);
  const hubType = document.getElementById('ws-hub-type').value;

  const rims  = getRimLibrary(stable);
  const tyres = getTyreLibrary(stable);
  const rim   = rims[rimIdx];
  const tyre  = tyres[tyreIdx];
  if (!rim)  { showFormError('Please select a rim.'); return null; }
  if (!tyre) { showFormError('Please select a tyre.'); return null; }

  let hub;
  try {
    if (hubType === 'singleSided') {
      const teeth   = parseInt(document.getElementById('ss-teeth').value, 10);
      const isFixed = radioValue('ss-type') === 'fixed';
      if (!teeth) { showFormError('Please enter a sprocket tooth count.'); return null; }
      hub = makeSingleSidedHub({ toothCount: teeth, isFixed });
    } else if (hubType === 'flipFlop') {
      const aTeeth   = parseInt(document.getElementById('ff-a-teeth').value, 10);
      const bTeeth   = parseInt(document.getElementById('ff-b-teeth').value, 10);
      const aIsFixed = radioValue('ff-a-type') === 'fixed';
      const bIsFixed = radioValue('ff-b-type') === 'fixed';
      const active   = radioValue('ff-active') || 'A';
      if (!aTeeth || !bTeeth) { showFormError('Please enter tooth counts for both sides.'); return null; }
      hub = makeFlipFlopHub({
        sideA: { toothCount: aTeeth, isFixed: aIsFixed, name: 'Side A' },
        sideB: { toothCount: bTeeth, isFixed: bIsFixed, name: 'Side B' },
        activeSide: active,
      });
    } else if (hubType === 'cassette') {
      const speeds  = parseInt(document.getElementById('cassette-speeds').value, 10);
      const spRaw   = document.getElementById('cassette-sprockets').value;
      const spTeeth = parseIntList(spRaw);
      if (!spTeeth.length) { showFormError('Please enter cassette sprocket tooth counts.'); return null; }
      hub = makeCassetteHub({
        speedCount: speeds,
        sprockets:  spTeeth.map(t => ({ toothCount: t, name: t + 't' })),
        name:       `${speeds}-speed`,
      });
    } else {
      const teeth  = parseInt(document.getElementById('igh-teeth').value, 10);
      const ratios = parseFloatList(document.getElementById('igh-ratios').value);
      if (!teeth)         { showFormError('Please enter an IGH sprocket tooth count.'); return null; }
      if (!ratios.length) { showFormError('Please enter at least one gear ratio.'); return null; }
      hub = makeHubGearHub({ sprocket: { toothCount: teeth, name: teeth + 't' }, ratios });
    }
  } catch (e) {
    showFormError(e.message);
    return null;
  }

  return makeWheelset({ name, rimBsd: rim.bsd, tyreWidth: tyre.width, hub });
}

function wireAddWheelsetForm(stable, onSave, onCancel) {
  updateWheelsetHubFields();

  document.getElementById('ws-hub-type')?.addEventListener('change', updateWheelsetHubFields);
  document.getElementById('btn-cancel-wheelset')?.addEventListener('click', onCancel);
  document.getElementById('add-wheelset-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const ws = buildWheelsetFromForm(stable);
    if (ws) onSave(ws);
  });
}
