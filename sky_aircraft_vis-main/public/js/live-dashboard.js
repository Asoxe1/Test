// live-dashboard.js
// Computes KPIs from `lastDisplayedBatch` (populated by map-live.js) and renders charts using Chart.js

(function(){
  // defensive: wait until Chart is available
  function kmh(ms){ return (Number(ms)||0)*3.6; }

  const SOCKET_URL = "http://localhost:8000";
  const API_BASE = '/api/historical';

  const els = {
    total: document.getElementById('kpiTotal'),
    onGround: document.getElementById('kpiOnGround'),
    pctGround: document.getElementById('kpiPctGround'),
    avgSpeed: document.getElementById('kpiAvgSpeed'),
    avgAlt: document.getElementById('kpiAvgAlt')
  };

  const filters = {
    airline: document.getElementById('filterAirline'),
    country: document.getElementById('filterCountry'),
    minSpeed: document.getElementById('filterMinSpeed'),
    showGround: document.getElementById('filterShowGround')
  };

  // Charts
  let topAirlinesChart = null;
  let avgSpeedChart = null;
  let filtersPopulated = false;

  function buildCharts(){
    const ctx = document.getElementById('chartTopAirlines').getContext('2d');
    topAirlinesChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Vols', data: [], backgroundColor: [], borderRadius: 8 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins:{ legend:{display:false}, tooltip:{mode:'index', intersect:false} },
        layout: { padding: { left: 6, right: 6, top: 6, bottom: 6 } },
        scales:{ 
          x:{ ticks:{color:'#475569'}, grid:{ display:false } },
          y:{ beginAtZero:true, ticks:{color:'#475569'}, grid:{ color:'rgba(15,23,42,0.06)' } }
        }
      }
    });

    const ctx2 = document.getElementById('chartAvgSpeed').getContext('2d');
    avgSpeedChart = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels:['Vitesse','Reste'], datasets:[{ data:[0,100], backgroundColor:['#2563eb','#e6eefc'] }] },
      options:{
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins:{ legend:{display:false}, tooltip:{enabled:true} },
        cutout: '66%'
      }
    });
  }

  function applyFiltersToData(data){
    if (!data || !Array.isArray(data)) return [];
    const selAirline = (filters.airline && filters.airline.value) || '';
    const selCountry = (filters.country && filters.country.value) || '';
    const minSpeedKmh = Number(filters.minSpeed ? filters.minSpeed.value : 0) || 0;
    const showGround = !(filters.showGround && filters.showGround.checked === false);

    return data.filter(d => {
      if (!showGround && d.on_ground) return false;
      const spdK = kmh(d.spd_ms || 0);
      if (spdK < minSpeedKmh) return false;
      if (selAirline){
        const cs = (d.callsign||'').trim();
        const prefix = cs ? (cs.match(/^[A-Z]{2,3}/)||[])[0] : '';
        if (!prefix || prefix !== selAirline) return false;
      }
      if (selCountry){
        const c = (d.origin_country||'').trim();
        if (!c || c !== selCountry) return false;
      }
      return true;
    });
  }

  function computeKPIs(data){
    const filtered = applyFiltersToData(data);
    const total = filtered.length;
    const onGround = filtered.filter(d=>d.on_ground).length;
    const pctGround = total ? Math.round(1000*(onGround/total))/10 : 0;

    const speeds = filtered.map(d=>kmh(d.spd_ms)).filter(s=>s>0);
    const avgSpeed = speeds.length ? Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length) : 0;

    const alts = filtered.map(d => (isFinite(d.geo_alt_m) ? Number(d.geo_alt_m) : (isFinite(d.baro_alt_m) ? Number(d.baro_alt_m) : NaN))).filter(a=>isFinite(a));
    const avgAlt = alts.length ? Math.round(alts.reduce((a,b)=>a+b,0)/alts.length) : 0;

    // top airlines by callsign prefix
    const counts = {};
    for(const d of filtered){
      const cs = (d.callsign||'').trim();
      const prefix = cs ? (cs.match(/^[A-Z]{2,3}/)||[])[0] : 'UNK';
      counts[prefix] = (counts[prefix]||0)+1;
    }
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);

    return { total, onGround, pctGround, avgSpeed, avgAlt, top };
  }

  function updateUI(kpis){
    if (els.total) els.total.textContent = kpis.total.toLocaleString('fr-FR');
    if (els.onGround) els.onGround.textContent = kpis.onGround.toLocaleString('fr-FR');
    if (els.pctGround) els.pctGround.textContent = `${kpis.pctGround}%`;
    if (els.avgSpeed) els.avgSpeed.textContent = kpis.avgSpeed ? `${kpis.avgSpeed} km/h` : '—';
    if (els.avgAlt) els.avgAlt.textContent = kpis.avgAlt ? `${kpis.avgAlt} m` : '—';

    // update top airlines chart (nice color ramp)
    if (topAirlinesChart){
      const labels = kpis.top.map(t=>t[0]);
      const values = kpis.top.map(t=>t[1]);
      const colors = labels.map((l,i) => `rgba(37,99,235,${0.9 - i*0.12})`);
      topAirlinesChart.data.labels = labels;
      topAirlinesChart.data.datasets[0].data = values;
      topAirlinesChart.data.datasets[0].backgroundColor = colors;
      topAirlinesChart.update();
    }

    // update avg speed donut (use 900 km/h as visual scale)
    if (avgSpeedChart){
      const val = Math.min(kpis.avgSpeed, 900);
      avgSpeedChart.data.datasets[0].data = [val, Math.max(0, 900 - val)];
      avgSpeedChart.update();
    }
  }

  let previousKpis = null;

  function kpisEqual(a,b){
    if (!a || !b) return false;
    if (a.total !== b.total) return false;
    if (a.onGround !== b.onGround) return false;
    if (a.pctGround !== b.pctGround) return false;
    if (a.avgSpeed !== b.avgSpeed) return false;
    if (a.avgAlt !== b.avgAlt) return false;
    const ta = (a.top||[]).map(x=>x[0]+':'+x[1]);
    const tb = (b.top||[]).map(x=>x[0]+':'+x[1]);
    if (ta.length !== tb.length) return false;
    for(let i=0;i<ta.length;i++) if (ta[i]!==tb[i]) return false;
    return true;
  }

  function populateFilters(data){
    try{
      if (!Array.isArray(data) || data.length===0) return;
      const airlineSet = new Set();
      const countrySet = new Set();
      for(const d of data){
        const cs = (d.callsign||'').trim();
        const prefix = cs ? (cs.match(/^[A-Z]{2,3}/)||[])[0] : '';
        if (prefix) airlineSet.add(prefix);
        if (d.origin_country) countrySet.add(String(d.origin_country).trim());
      }
      const airlineArr = Array.from(airlineSet).sort();
      const countryArr = Array.from(countrySet).sort();

      if (filters.airline){
        const sel = filters.airline.value || '';
        filters.airline.innerHTML = '<option value="">Toutes les compagnies</option>' + airlineArr.map(a=>`<option value="${a}">${a}</option>`).join('');
        if (sel) filters.airline.value = sel;
      }
      if (filters.country){
        const selc = filters.country.value || '';
        filters.country.innerHTML = '<option value="">Tous les pays</option>' + countryArr.map(c=>`<option value="${c}">${c}</option>`).join('');
        if (selc) filters.country.value = selc;
      }
      filtersPopulated = true;
    }catch(e){ console.warn('populateFilters error', e); }
  }

  function refresh(){
    try{
      // prefer in-memory batch from map-live; fallback to localStorage cache written by map-live
      let data = window.lastDisplayedBatch || null;
      if ((!data || !Array.isArray(data) || data.length === 0) && typeof localStorage !== 'undefined'){
        try{
          const raw = localStorage.getItem('sky_aircraft_last_batch_v1');
          if (raw){ const parsed = JSON.parse(raw); if (parsed && Array.isArray(parsed.batch)) data = parsed.batch; }
        }catch(e){ /* ignore */ }
      }
      data = data || [];
      if (!filtersPopulated) populateFilters(data);
      const kpis = computeKPIs(data);
      // Only update UI/charts when values changed to avoid layout churn
      if (!previousKpis || !kpisEqual(previousKpis, kpis)){
        updateUI(kpis);
        previousKpis = kpis;
      }
    }catch(e){ console.error('live-dashboard refresh error', e); }
  }

  // Try to fetch the latest historical snapshot from server (files list -> first file)
  async function fetchLatestFromServer(){
    try{
      const filesRes = await fetch(`${SOCKET_URL}${API_BASE}/files`);
      if (!filesRes.ok) throw new Error('No files');
      const files = await filesRes.json();
      if (!Array.isArray(files) || files.length === 0) throw new Error('Empty files');
      const latest = files[0];
      const dataRes = await fetch(`${SOCKET_URL}${API_BASE}/data/${latest}`);
      if (!dataRes.ok) throw new Error('Failed to fetch data');
      const text = await dataRes.text();
      // parse CSV rows (many are headerless)
      let rows = [];
      try{ rows = d3.csvParseRows(text); }catch(e){ rows = []; }
      const mapped = rows.map(r => {
        const ts_iso = r[0] || '';
        const icao24 = r[1] || '';
        const callsign = r[2] || '';
        const origin_country = r[3] || '';
        const lat = parseFloat(r[4]);
        const lon = parseFloat(r[5]);
        const geo_alt_m = r[6] ? parseFloat(r[6]) : NaN;
        const baro_alt_m = r[7] ? parseFloat(r[7]) : NaN;
        const spd_ms = r[8] ? parseFloat(r[8]) : NaN;
        const hdg_deg = r[9] ? parseFloat(r[9]) : NaN;
        const vr_ms = r[10] ? parseFloat(r[10]) : NaN;
        const on_ground = (r[11]||'').toLowerCase() === 'true';
        return { ts_iso, icao24, callsign, origin_country, lon, lat, baro_alt_m, on_ground, spd_ms, hdg_deg, vr_ms, geo_alt_m };
      }).filter(d => isFinite(Number(d.lat)) && isFinite(Number(d.lon)));

      // write to localStorage so other pages can pick it up
      try{ localStorage.setItem('sky_aircraft_last_batch_v1', JSON.stringify({ ts: Date.now(), batch: mapped })); }catch(e){}
      // update UI immediately
      previousKpis = null; // force update
      populateFilters(mapped);
      refresh();
      const lastSyncEl = document.getElementById('lastSync'); if (lastSyncEl) lastSyncEl.textContent = new Date().toLocaleString();
      return true;
    }catch(e){ console.warn('fetchLatestFromServer failed', e); return false; }
  }

  // Init
  function init(){
    // wait for Chart to be present
    if (typeof Chart === 'undefined'){
      setTimeout(init, 200);
      return;
    }
    buildCharts();
    refresh();
    // refresh every 2s to reduce churn
    setInterval(refresh, 2000);
  }

  init();

  // Listen for immediate batch updates from map-live and refresh when new data arrives.
  try{ window.addEventListener('skyvis:batch', (ev)=>{ try{ refresh(); }catch(e){} }); }catch(e){}
  // Listen for storage events (other tabs writing cached batch into localStorage).
  try{ window.addEventListener('storage', (ev) => { if (!ev) return; try{ if (ev.key === 'sky_aircraft_last_batch_v1'){ populateFilters(JSON.parse(localStorage.getItem('sky_aircraft_last_batch_v1')||'{}').batch || []); refresh(); } }catch(e){} }); }catch(e){}

  // Wire filters to refresh on change
  try{
    if (filters.airline) filters.airline.addEventListener('change', ()=>{ previousKpis = null; refresh(); });
    if (filters.country) filters.country.addEventListener('change', ()=>{ previousKpis = null; refresh(); });
    if (filters.minSpeed) filters.minSpeed.addEventListener('change', ()=>{ previousKpis = null; refresh(); });
    if (filters.showGround) filters.showGround.addEventListener('change', ()=>{ previousKpis = null; refresh(); });
  }catch(e){}

  // Expose manual refresh button (if present)
  try{
    const btn = document.getElementById('refreshServerBtn');
    if (btn) btn.addEventListener('click', async ()=>{
      btn.disabled = true; btn.textContent = '⏳ Chargement...';
      await fetchLatestFromServer();
      btn.disabled = false; btn.textContent = '🔄 Rafraîchir';
    });
  }catch(e){}
})();
