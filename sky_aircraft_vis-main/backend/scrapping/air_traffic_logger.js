/**
 * Mini logger trafic aérien (Europe) - OpenSky -> CSV par MINUTE
 * Usage:
 * node air_traffic_logger.js
 * Prérequis: Node >= 18
 *
 * Ce script:
 * - interroge OpenSky toutes les 15 s (bbox Europe),
 * - écrit/écrase un fichier CSV par minute (positions_YYYY-MM-DD_HH-MM.csv),
 * - maintient le comptes ico24 uniques du jour (state/daily_seen_YYYY-MM-DD.json).
 */

import fs from "node:fs";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

// ---------- Config (modifie si besoin) ----------
const POLL_MS = 15_000; // 15 s : cadence de sondage rapide
// BBox Europe (Ouest et Centrale)
const FR_BBOX = { lamin: 36.0, lomin: -11.0, lamax: 65.0, lomax: 25.0 };
// Si tu as un compte OpenSky, tu peux utiliser la Basic Auth: https://USERNAME:PASSWORD@opensky-network.org
const OPEN_SKY_BASE = "https://opensky-network.org/api/states/all";

// Dossiers de sortie
const DATA_DIR = path.resolve("data");
const STATE_DIR = path.resolve("state");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

// État de la journée
let currentDay = todayStr();
let seen = new Set();
let lastLoggedMinute = ""; // Nouveau pour suivre la minute du dernier log

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
// NOUVELLE FONCTION: Génère une clé de temps unique par minute (UTC)
function minuteStr() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}_${h}-${min}`;
}
function statePathFor(day) {
  return path.join(STATE_DIR, `daily_seen_${day}.json`);
}

// NOUVEAU: Utilise la clé minute pour le chemin
function getCsvPath(timeKey) {
  return path.join(DATA_DIR, `positions_${timeKey}.csv`);
}

function ensureCsvHeader(p) {
  if (!fs.existsSync(p)) {
    fs.writeFileSync(
      p,
      "ts_iso,icao24,callsign,origin_country,lat,lon,geo_alt_m,baro_alt_m,spd_ms,hdg_deg,vr_ms,on_ground\n",
      "utf8"
    );
  }
}

function toCsvRow(d) {
  const esc = (v) =>
    v == null ? "" : String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return [
    esc(d.ts_iso),
    esc(d.icao24),
    esc((d.callsign || "").trim()),
    esc(d.origin_country),
    esc(d.lat),
    esc(d.lon),
    esc(d.geo_alt_m),
    esc(d.baro_alt_m),
    esc(d.spd_ms),
    esc(d.hdg_deg),
    esc(d.vr_ms),
    esc(d.geo_alt_m),
  ].join(",");
}

function mapStateVector(s, ts) {
  return {
    ts_iso: new Date((s[4] ?? ts) * 1000).toISOString(),
    icao24: s[0],
    callsign: (s[1] || "").trim(),
    origin_country: s[2],
    lon: s[5],
    lat: s[6],
    baro_alt_m: s[7],
    on_ground: !!s[8],
    spd_ms: s[9],
    hdg_deg: s[10],
    vr_ms: s[11],
    geo_alt_m: s[13],
  };
}

function loadSeenSet(day) {
  const p = statePathFor(day);
  if (fs.existsSync(p)) {
    try {
      const data = fs.readFileSync(p, "utf8");
      return new Set(JSON.parse(data));
    } catch (e) {
      console.warn("Erreur lecture state:", e.message);
      return new Set();
    }
  }
  return new Set();
}

function saveSeenSet(day, set) {
  const p = statePathFor(day);
  try {
    const arr = Array.from(set);
    fs.writeFileSync(p, JSON.stringify(arr), "utf8");
  } catch (e) {
    console.warn("Erreur écriture state:", e.message);
  }
}

async function fetchOpenSkyFrance() {
  const { lamin, lomin, lamax, lomax } = FR_BBOX;
  const url = `${OPEN_SKY_BASE}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

  const res = await fetch(url, { headers: { "User-Agent": "edu-demo" } });
  if (!res.ok) throw new Error("HTTP " + res.status);

  return res.json();
}

// Boucle principale
async function runLoop() {
  while (true) {
    try {
      const today = todayStr();
      if (today !== currentDay) {
        currentDay = today;
        seen = loadSeenSet(currentDay);
        console.log(`📅 Nouveau jour détecté: ${currentDay} → compteur remis à zéro.`);
      }
      
      const data = await fetchOpenSkyFrance();
      const ts = data.time || Math.floor(Date.now() / 1000);
      const states = Array.isArray(data.states) ? data.states : [];
      
      const currentMinuteKey = minuteStr();
      const currentCsvPath = getCsvPath(currentMinuteKey);

      // Filtrage simple: garde uniquement ceux avec lat/lon valides
      // rows will hold parsed objects (not CSV strings) so we can write to DB as well
      const rows = [];
      let newUniques = 0;

      for (const s of states) {
        const obj = mapStateVector(s, ts);
        if (obj.lat === "" || obj.lon === "") continue;

        // store object (we'll serialize to CSV when writing, and also insert into SQLite)
        rows.push(obj);

        // compteur unique du jour
        if (obj.icao24) {
          if (!seen.has(obj.icao24)) {
            seen.add(obj.icao24);
            newUniques++;
          }
        }
      }
      
      // LOGIQUE D'ÉCRITURE À LA MINUTE
      if (rows.length && currentMinuteKey !== lastLoggedMinute) {
        ensureCsvHeader(currentCsvPath); // S'assure que l'en-tête est là
        
        // Écrit TOUT le contenu dans le nouveau fichier de la minute (écrasement)
        fs.writeFileSync(currentCsvPath, rows.map(toCsvRow).join("\n") + "\n", "utf8");
        // insert into SQLite (attempt dynamic import of CommonJS helper)
        try {
          let sqliteModule = null;
          try {
            // dynamic import of CommonJS file will expose default = module.exports
            sqliteModule = await import(path.join(__dirname, 'sqlite.cjs'));
          } catch (e) {
            // fallback to file URL style
            sqliteModule = await import('./sqlite.cjs');
          }

          const sqlite = sqliteModule && sqliteModule.default ? sqliteModule.default : sqliteModule;
          if (sqlite) {
            await sqlite.init(path.join(DATA_DIR, 'positions.db'));
            const count = sqlite.insertBatch(currentMinuteKey, rows);
            console.log(`💾 SQLite: inséré ${count} lignes (minute ${currentMinuteKey})`);
          }
        } catch (err) {
          console.warn('⚠️ Erreur écriture SQLite:', String(err.message || err));
        }
        
        lastLoggedMinute = currentMinuteKey;
      }


      if (newUniques > 0) {
        saveSeenSet(currentDay, seen);
      }

      const now = new Date().toLocaleTimeString();
      console.log(
        `[${now}] +${rows.length} lignes enregistrées. Uniques today: ${seen.size}. Cadence: ${POLL_MS / 1000}s`
      );
    } catch (e) {
      console.warn(`⚠️ Erreur lecture OpenSky: ${e.message}`);
    } finally {
      await wait(POLL_MS);
    }
  }
}

// Initialisation au démarrage
console.log(`--- Démarrage Logger Trafic Aérien (Europe) ---`);
runLoop();