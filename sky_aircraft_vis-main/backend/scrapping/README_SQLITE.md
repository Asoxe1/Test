# SQLite integration for scrapping

This project now supports storing OpenSky position batches into a local SQLite database (positions.db) in `public/scrapping/data`.

Note about Windows / native builds
---------------------------------
The helper tries `better-sqlite3` first (fast, native), but on Windows that package often requires Visual Studio C++ build tools and may fail to compile. To avoid install issues, the project now uses `sql.js` (WASM) as a fallback. `better-sqlite3` is kept as an optional dependency — if it's present the helper uses it, otherwise sql.js will be used automatically.

How it works
- `sqlite.cjs` (CommonJS helper) uses `better-sqlite3` and exposes simple helpers: `init`, `insertBatch`, `queryRecent`, `listMinutes`, `queryByMinute`, `queryByIcao`.
- `server.js` writes minute CSV files as before and also inserts rows into SQLite automatically.
- `air_traffic_logger.js` writes minute CSV files and attempts to insert rows into SQLite (dynamic import).

Quick setup
1. From `public/scrapping` run:

```powershell
npm install
```

If you want native performance and are able to install Windows build tools, you can install `better-sqlite3` (optional). If not, `sql.js` will work without any native build.

2. Start the server (this script will try to initialize SQLite):

```powershell
npm start
```

3. Run the included tiny test to exercise the DB helper:

```powershell
npm run test-sqlite
```

APIs
- `/api/historical/db/files` — list minute keys and counts (requires SQLite).
- `/api/historical/db/data/:minuteKey` — returns JSON rows for a given minute key (requires SQLite).
- `/api/historical/db/query?icao24=XXXX` — search rows for an icao24 (requires SQLite).

If `better-sqlite3` isn't installed or fails to initialize, the server will continue to write CSV files but the DB-related endpoints will return errors.
