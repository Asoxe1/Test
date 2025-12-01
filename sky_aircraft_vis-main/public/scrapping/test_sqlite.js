const path = require('path');
const sqlite = require('./sqlite.cjs');

;(async () => {
  const DB = await sqlite.init(path.join(__dirname, 'data', 'positions-test.db'));
  console.log('DB initialized');
const sample = [
  { ts_iso: new Date().toISOString(), icao24: 'abcd01', callsign: 'TEST1', origin_country: 'FR', lat: 48.85, lon: 2.35, geo_alt_m: 10000, baro_alt_m: 9800, spd_ms: 200, hdg_deg: 90, vr_ms: 0, on_ground: false },
  { ts_iso: new Date().toISOString(), icao24: 'efgh02', callsign: 'TEST2', origin_country: 'FR', lat: 50.0, lon: 3.0, geo_alt_m: 11000, baro_alt_m: 10800, spd_ms: 210, hdg_deg: 180, vr_ms: 0, on_ground: false }
];

const minuteKey = 'test_min';
  const n = sqlite.insertBatch(minuteKey, sample);
  console.log('Inserted', n, 'rows');

  const recent = sqlite.queryRecent(10);
  console.log('Recent rows:', recent.length);

  const byMinute = sqlite.queryByMinute(minuteKey);
  console.log('By minute:', byMinute.length);

  process.exit(0);
})();
