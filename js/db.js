// db.js
// IndexedDB persistence for the Stable.
// Stores the entire Stable as a single JSON-serialised record (key = 'current').
// Also provides JSON file export and import for manual device-to-device transfer.

const DB = (() => {
  const DB_NAME    = 'GearInchCalculator';
  const DB_VERSION = 1;
  const STORE      = 'stable';
  const KEY        = 'current';

  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(STORE);
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  // Save the entire Stable. Serialises to JSON to strip any non-data properties.
  async function save(stable) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const data = JSON.parse(JSON.stringify(stable));
      const tx   = db.transaction(STORE, 'readwrite');
      const req  = tx.objectStore(STORE).put(data, KEY);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  // Load the Stable. Returns null if nothing is saved yet.
  async function load() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  // Download the Stable as a JSON file to the user's device.
  function exportJSON(stable) {
    const json = JSON.stringify(stable, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'MyStable.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Read a JSON file chosen by the user and parse it into a Stable object.
  // Returns a Promise<object> — caller is responsible for validation.
  function importJSON(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('No file provided.')); return; }
      const reader = new FileReader();
      reader.onload  = e => {
        try   { resolve(JSON.parse(e.target.result)); }
        catch { reject(new Error('File is not valid JSON.')); }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  return { save, load, exportJSON, importJSON };
})();
