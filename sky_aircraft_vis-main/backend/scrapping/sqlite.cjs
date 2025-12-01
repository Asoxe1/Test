/*
 * sqlite.cjs — simple helper (CommonJS) for SQLite storage of positions
 * Uses better-sqlite3 (synchronous API) for simplicity.
 * Exports: init(dbPath), insertBatch(minuteKey, rows), close(), queryRecent(limit)
 */

const path = require('path');
const fs = require('fs');

let mode = 'none'; // 'better' or 'sqljs'
let db = null;
let dbPathGlobal = null;
let SQLJS = null; // sql.js module when used

async function init(dbPath) {
  dbPathGlobal = dbPath;

  // if already initialized return
  if (db) return db;

  // Try native better-sqlite3 first
  try {
    const Better = require('better-sqlite3');
    db = new Better(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        minute_key TEXT,
        ts_iso TEXT,
        icao24 TEXT,
        callsign TEXT,
        origin_country TEXT,
        lat REAL,
        lon REAL,
        geo_alt_m REAL,
        baro_alt_m REAL,
        spd_ms REAL,
        hdg_deg REAL,
        vr_ms REAL,
        on_ground INTEGER
      );
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_positions_icao24 ON positions(icao24);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_positions_minute ON positions(minute_key);');

    mode = 'better';
    return db;
  } catch (e) {
    // fallthrough to sql.js
  }

  // Fallback to sql.js (WASM) — no native build required
  try {
    const initSqlJs = require('sql.js');
    SQLJS = await initSqlJs();

    // load existing DB file if present
    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      db = new SQLJS.Database(new Uint8Array(buf));
    } else {
      db = new SQLJS.Database();
    }

    // ensure schema exists
    db.run(`
      CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        minute_key TEXT,
        ts_iso TEXT,
        icao24 TEXT,
        callsign TEXT,
        origin_country TEXT,
        lat REAL,
        lon REAL,
        geo_alt_m REAL,
        baro_alt_m REAL,
        spd_ms REAL,
        hdg_deg REAL,
        vr_ms REAL,
        on_ground INTEGER
      );
    `);
    // indexes
    try { db.run('CREATE INDEX IF NOT EXISTS idx_positions_icao24 ON positions(icao24);'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_positions_minute ON positions(minute_key);'); } catch(e) {}

    mode = 'sqljs';

    // persist immediately to create the file if missing
    persistSqlJs();
    return db;
  } catch (err) {
    console.warn('SQLite initialization failed (no available driver):', err.message || err);
    throw err;
  }
}

function persistSqlJs() {
  if (mode !== 'sqljs' || !db || !dbPathGlobal) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPathGlobal, Buffer.from(data));
  } catch (e) {
    console.warn('⚠️ sql.js persist failed:', e.message || e);
  }
}

function insertBatch(minuteKey, rows) {
  if (!db) throw new Error('DB not initialized — call init(path) first');
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  if (mode === 'better') {
    const insert = db.prepare(`
      INSERT INTO positions (
        minute_key, ts_iso, icao24, callsign, origin_country,
        lat, lon, geo_alt_m, baro_alt_m, spd_ms, hdg_deg, vr_ms, on_ground
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const r of items) {
        insert.run(
          minuteKey,
          r.ts_iso || null,
          r.icao24 || null,
          r.callsign || null,
          r.origin_country || null,
          r.lat == null ? null : Number(r.lat),
          r.lon == null ? null : Number(r.lon),
          r.geo_alt_m == null ? null : Number(r.geo_alt_m),
          r.baro_alt_m == null ? null : Number(r.baro_alt_m),
          r.spd_ms == null ? null : Number(r.spd_ms),
          r.hdg_deg == null ? null : Number(r.hdg_deg),
          r.vr_ms == null ? null : Number(r.vr_ms),
          r.on_ground ? 1 : 0
        );
      }
    });

    insertMany(rows);
    return rows.length;
  }

  // sql.js path
  if (mode === 'sqljs') {
    // use a prepared statement (faster), but SQL.js prepared is slightly different
    const stmt = db.prepare(`INSERT INTO positions (
      minute_key, ts_iso, icao24, callsign, origin_country,
      lat, lon, geo_alt_m, baro_alt_m, spd_ms, hdg_deg, vr_ms, on_ground
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    db.exec('BEGIN;');
    try {
      for (const r of rows) {
        stmt.run([
          minuteKey,
          r.ts_iso || null,
          r.icao24 || null,
          r.callsign || null,
          r.origin_country || null,
          r.lat == null ? null : Number(r.lat),
          r.lon == null ? null : Number(r.lon),
          r.geo_alt_m == null ? null : Number(r.geo_alt_m),
          r.baro_alt_m == null ? null : Number(r.baro_alt_m),
          r.spd_ms == null ? null : Number(r.spd_ms),
          r.hdg_deg == null ? null : Number(r.hdg_deg),
          r.vr_ms == null ? null : Number(r.vr_ms),
          r.on_ground ? 1 : 0
        ]);
      }
      db.exec('COMMIT;');
    } finally {
      try { stmt.free(); } catch(e){}
      // persist file
      persistSqlJs();
    }
    return rows.length;
  }

  throw new Error('No DB driver available');
}

function queryRecent(limit = 100) {
  if (!db) throw new Error('DB not initialized');
  if (mode === 'better') return db.prepare('SELECT * FROM positions ORDER BY id DESC LIMIT ?').all(limit);
  if (mode === 'sqljs') {
    const stmt = db.prepare('SELECT * FROM positions ORDER BY id DESC LIMIT ?');
    const rows = [];
    try {
      stmt.bind([limit]);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally { try { stmt.free(); } catch(e){} }
    return rows;
  }
  throw new Error('No DB driver available');
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { init, insertBatch, queryRecent, close };
// Convenience helpers
module.exports.listMinutes = function(limit = 200) {
  if (!db) throw new Error('DB not initialized');
  if (mode === 'better') return db.prepare('SELECT minute_key, COUNT(*) as cnt FROM positions GROUP BY minute_key ORDER BY minute_key DESC LIMIT ?').all(limit);
  if (mode === 'sqljs') {
    const stmt = db.prepare('SELECT minute_key, COUNT(*) as cnt FROM positions GROUP BY minute_key ORDER BY minute_key DESC LIMIT ?');
    const rows = [];
    try {
      stmt.bind([limit]);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally { try { stmt.free(); } catch(e){} }
    return rows;
  }
  throw new Error('No DB driver available');
}

module.exports.queryByMinute = function(minuteKey) {
  if (!db) throw new Error('DB not initialized');
  if (mode === 'better') return db.prepare('SELECT * FROM positions WHERE minute_key = ? ORDER BY ts_iso ASC').all(minuteKey);
  if (mode === 'sqljs') {
    const stmt = db.prepare('SELECT * FROM positions WHERE minute_key = ? ORDER BY ts_iso ASC');
    const rows = [];
    try {
      stmt.bind([minuteKey]);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally { try { stmt.free(); } catch(e){} }
    return rows;
  }
  throw new Error('No DB driver available');
}

module.exports.queryByIcao = function(icao24, limit = 100) {
  if (!db) throw new Error('DB not initialized');
  if (mode === 'better') return db.prepare('SELECT * FROM positions WHERE icao24 = ? ORDER BY ts_iso DESC LIMIT ?').all(icao24, limit);
  if (mode === 'sqljs') {
    const stmt = db.prepare('SELECT * FROM positions WHERE icao24 = ? ORDER BY ts_iso DESC LIMIT ?');
    const rows = [];
    try {
      stmt.bind([icao24, limit]);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally { try { stmt.free(); } catch(e){} }
    return rows;
  }
  throw new Error('No DB driver available');
}
