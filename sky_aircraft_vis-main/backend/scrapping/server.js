// server.js — OpenSky (OAuth2) + Socket.IO + CSV — poll 60s

const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
// node-fetch v3 est ESM -> import dynamique en CommonJS
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

/* =========================
   CONFIG
========================= */

const PORT = 8000;

// ===============================
// OPEN SKY OAuth2 Client Credentials
// ===============================
const OS_CLIENT_ID = "tristan-api-client";
const OS_CLIENT_SECRET = "RJEYgAQUUrXysgZ5buHsyG1i8gPDCeDF"; // ⚠ pense à le régénérer plus tard

let accessToken = null;
let tokenExpiresAt = 0; // timestamp ms

// BBox Europe (Ouest et Centrale)
const EUROPE_WEST = {
  lamin: 36.0,
  lomin: -11.0,
  lamax: 65.0,
  lomax: 25.0
};
const FR = EUROPE_WEST;

// cadence de base (ms) en **authentifié**
const POLL_MS_BASE = 60_000; // 60 s
let pollMs = POLL_MS_BASE;

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- SQLite integration (optional) ---
let dbHelper = null;
let dbInitPromise = null;
try {
  dbHelper = require(path.join(__dirname, 'sqlite.cjs'));
  const dbPath = path.join(DATA_DIR, 'positions.db');
  dbInitPromise = dbHelper.init(dbPath).then(() => {
    console.log('✅ SQLite initialized at', dbPath);
  }).catch((e) => {
    console.warn('⚠️ SQLite helper failed to initialize:', String(e.message || e));
  });
} catch (e) {
  console.warn('⚠️ SQLite helper not available:', e.message);
}
/* =========================
   SERVER + STATIC + SOCKET
========================= */

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Permet d'accéder aux fichiers du dossier 'public'
app.use(express.static(path.join(ROOT, "..")));

app.use(express.static(ROOT)); // sert index.html + assets (dans 'scrapping')
app.get("/", (_, res) => res.sendFile(path.join(ROOT, "index.html")));

io.on("connection", (sock) => console.log("Client connecté:", sock.id));

/* =========================
   UTILS CSV
========================= */

function minuteStr() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}_${h}-${min}`;
}

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
    esc(d.on_ground)
  ].join(",");
}

/* =========================
   OAuth2 : récupération du token
========================= */

async function getAccessToken() {
  const now = Date.now();

  // token encore valide ?
  if (accessToken && now < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  const tokenUrl =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: OS_CLIENT_ID,
    client_secret: OS_CLIENT_SECRET
  }).toString();

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Token HTTP " + res.status + " - " + txt);
  }

  const json = await res.json();
  accessToken = json.access_token;
  const expiresIn = json.expires_in || 1800;
  tokenExpiresAt = now + expiresIn * 1000;

  console.log("🔑 Nouveau token OpenSky récupéré, expire dans", expiresIn, "s");
  return accessToken;
}

/* =========================
   FETCH OPEN SKY (OAuth2 Bearer)
========================= */

async function fetchOpenSkyFrance() {
  const { lamin, lomin, lamax, lomax } = FR;
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

  const token = await getAccessToken();

  const res = await fetch(url, {
    headers: {
      "User-Agent": "edu-demo",
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    // si le token est invalide, on le vide pour forcer un refresh au prochain appel
    if (res.status === 401 || res.status === 403) {
      accessToken = null;
      tokenExpiresAt = 0;
    }
    throw new Error("HTTP " + res.status);
  }

  const data = await res.json();
  const ts = data.time || Math.floor(Date.now() / 1000);

  const arr = (data.states || [])
    .map((s) => ({
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
      geo_alt_m: s[13]
    }))
    .filter(
      (d) => Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lon))
    );

  const key = `${arr.length}@${ts}`;
  return { key, ts, arr };
}

/* =========================
   POLL LOOP
========================= */

let lastBatchKey = "";
let lastArr = [];
const seenToday = new Set();
let lastLoggedMinute = "";

function scheduleNext() {
  const jitter = Math.floor(Math.random() * 5000);
  setTimeout(pollLoop, pollMs + jitter);
}

async function pollLoop() {
  try {
    const { key, arr } = await fetchOpenSkyFrance();

    const currentMinuteKey = minuteStr();
    const currentCsvPath = getCsvPath(currentMinuteKey);

    if (key !== lastBatchKey) {
      lastBatchKey = key;

      if (arr.length && currentMinuteKey !== lastLoggedMinute) {
        ensureCsvHeader(currentCsvPath);

        const lines = arr.map(toCsvRow).join("\n") + "\n";
        fs.writeFileSync(currentCsvPath, lines, "utf8");

        // write to SQLite (if available)
        try {
          if (dbHelper) {
            const count = dbHelper.insertBatch(currentMinuteKey, arr);
            console.log(`💾 SQLite: inséré ${count} lignes (minute ${currentMinuteKey})`);
          }
        } catch (err) {
          console.warn('⚠️ Erreur écriture SQLite:', String(err.message || err));
        }

        lastLoggedMinute = currentMinuteKey;
        console.log(`\n💾 NOUVEAU fichier créé: ${currentMinuteKey}.csv`);
      }

      for (const d of arr) if (d.icao24) seenToday.add(d.icao24);

      lastArr = arr;
      io.emit("data:batch", arr);

      console.log(
        `✔ ${new Date().toLocaleTimeString()} — émis ${arr.length} avions — uniques today: ${seenToday.size}`
      );
    } else {
      io.emit("data:batch", lastArr);
      console.log("= batch identique, réémis lastArr:", lastArr.length);
    }

    pollMs = POLL_MS_BASE;
  } catch (e) {
    const msg = String(e.message || e);
    console.warn("⚠️ OpenSky:", msg);

    if (msg.includes("HTTP 429")) {
      pollMs = Math.min(Math.round(pollMs * 1.8), 180_000);
    } else if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
      accessToken = null;
      tokenExpiresAt = 0;
      pollMs = 180_000;
    } else {
      pollMs = Math.min(Math.round(pollMs * 1.5), 120_000);
    }

    if (lastArr.length) io.emit("data:batch", lastArr);
  } finally {
    scheduleNext();
  }
}

/* =========================
   API HISTORIQUE
========================= */

// API pour lister les fichiers historiques disponibles
app.get("/api/historical/files", (_, res) => {
  fs.readdir(DATA_DIR, (err, files) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Erreur lecture répertoire historique." });
    }
    const csvFiles = files
      .filter((f) => f.endsWith(".csv") && f.startsWith("positions_"))
      .sort()
      .reverse();
    res.json(csvFiles);
  });
});

// API pour récupérer le contenu d'un fichier CSV
app.get("/api/historical/data/:filename", (req, res) => {
  const filename = req.params.filename;
  if (
    !filename.endsWith(".csv") ||
    !filename.startsWith("positions_") ||
    filename.includes("..")
  ) {
    return res.status(400).json({ error: "Nom de fichier invalide." });
  }
  const filePath = path.join(DATA_DIR, filename);

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res
        .status(404)
        .json({ error: "Fichier non trouvé ou illisible." });
    }
    res.type("text/csv").send(data);
  });
});

// --- APIs backed by SQLite (if enabled) ---
app.get('/api/historical/db/files', (_, res) => {
  if (!dbHelper) return res.status(500).json({ error: 'SQLite DB not enabled' });
  try {
    const rows = dbHelper.listMinutes(500);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/historical/db/data/:minuteKey', (req, res) => {
  if (!dbHelper) return res.status(500).json({ error: 'SQLite DB not enabled' });
  const minuteKey = req.params.minuteKey;
  if (!minuteKey || minuteKey.includes('..')) return res.status(400).json({ error: 'Invalid minuteKey' });
  try {
    const rows = dbHelper.queryByMinute(minuteKey);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/historical/db/query', (req, res) => {
  if (!dbHelper) return res.status(500).json({ error: 'SQLite DB not enabled' });
  const { icao24, limit = 200 } = req.query;
  if (!icao24) return res.status(400).json({ error: 'Missing icao24 parameter' });
  try {
    const rows = dbHelper.queryByIcao(String(icao24), Number(limit));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =========================
   DEBUG
========================= */

app.get("/api/fetch-now", async (_, res) => {
  try {
    const { arr } = await fetchOpenSkyFrance();
    res.json({ ok: true, count: arr.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/debug", (_, res) =>
  res.json({ count: lastArr.length, sample: lastArr[0] || null })
);
app.get("/health", (_, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

/* =========================
   START
========================= */

server.listen(PORT, () => {
  (async () => {
    try {
      if (dbInitPromise) await dbInitPromise;
    } catch (e) {
      // ignore
    }
    console.log(`✅ Dashboard sur http://localhost:${PORT}`);
    pollLoop();
  })();
});
