// Fichier: sky_aircraft_vis/public/js/map-live.js

// ==============================
// CONFIG
// ==============================
// Use same-origin socket URL so the main server can proxy to the scrapping service
const SOCKET_URL = window.location.origin;
const API_BASE = '/api/historical'; 

// BBox Europe (Ouest et Centrale)
const EUROPE_WEST_BOUNDS = L.latLngBounds([[36.0, -11.0], [65.0, 25.0]]);

// Liste prédéfinée de quelques grands préfixes de compagnies pour le filtre
const AIRLINE_PREFIXES = {
    'AF': 'Air France', 'LH': 'Lufthansa', 'BA': 'British Airways',
    'KL': 'KLM', 'RYR': 'Ryanair', 'EZY': 'EasyJet',
    'AAL': 'American Airlines', 'DAL': 'Delta Airlines', 'UAE': 'Emirates',
};

// ==============================
// STATE
// ==============================
let map, layerGroup;
let aircraftMarkers = new Map(); 
let countries = new Set();
let uniqueToday = new Set();
let lastDisplayedBatch = []; 
let isProcessing = false; 
let socket; 
let batch = [];
let batchTimer = null;
let sharedWorker = null;
let sharedPort = null;
let bc = null; // BroadcastChannel for master election
let isMaster = false;

const loader = document.getElementById('loaderOverlay');
const mapModeTitle = document.getElementById('map-mode-title');
const dataSourceSpan = document.getElementById('current-data-source');
const statusDot = document.getElementById('statusDot'); 


function showLoader() { if (loader) loader.classList.remove('hidden'); }
function hideLoader() { if (loader) loader.classList.add('hidden'); }

// Local cache key for last batch (cross-navigation)
const LOCAL_BATCH_KEY = 'sky_aircraft_last_batch_v1';

function saveBatchToLocal(batchArr){
    try{
        const payload = { ts: Date.now(), batch: batchArr };
        localStorage.setItem(LOCAL_BATCH_KEY, JSON.stringify(payload));
    }catch(e){/* ignore */}
}

function loadBatchFromLocal(){
    try{
        const s = localStorage.getItem(LOCAL_BATCH_KEY);
        if (!s) return null;
        const p = JSON.parse(s);
        return p;
    }catch(e){ return null; }
}


// ==============================
// INIT MAP (unchanged)
// ==============================
map = L.map('map', { zoomSnap: 0.25 }).fitBounds(EUROPE_WEST_BOUNDS);

// Thème Positron (Clair et Minimaliste)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 10,
  minZoom: 4,
}).addTo(map);

layerGroup = L.layerGroup().addTo(map);

const tooltip = document.getElementById('tooltip');

// --- UTILS ---
function kmhFromMs(ms){return Math.round((Number(ms)||0)*3.6)}
function speedClass(ms){
  const kmh = kmhFromMs(ms);
  if (kmh >= 700) return 'speed-high';
  if (kmh >= 300) return 'speed-mid';
  return 'speed-low';
}
function mkKey(d){ return d.icao24 || d.callsign || Math.random().toString(36).slice(2); }
function formatCallsign(cs){ return cs && cs.trim() ? cs.trim() : '—'; }

function showTooltip(e, d){
    const {originalEvent} = e; const x = originalEvent.clientX, y = originalEvent.clientY;
    tooltip.classList.remove('hidden');
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    const alt = Math.round(Number(d.geo_alt_m||d.baro_alt_m||0));
    tooltip.innerHTML = `
      <strong>${formatCallsign(d.callsign)}</strong><br/>
      ${d.origin_country || '—'}<br/>
      Alt: ${alt.toLocaleString()} m<br/>
      Vitesse: ${kmhFromMs(d.spd_ms)} km/h<br/>
      Cap: ${Math.round(Number(d.hdg_deg||0))}°<br/>
      Sol: ${d.on_ground ? 'oui' : 'non'}<br/>
      ICAO24: ${d.icao24 || '—'}
    `;
}
function hideTooltip(){ tooltip.classList.add('hidden'); }

function updateKPIs(nowCount){
  document.getElementById('kpiNow').textContent = nowCount.toLocaleString('fr-FR');
  document.getElementById('lastUpdate').textContent = 'Dernière mise à jour : ' + new Date().toLocaleTimeString();
}

function applyFilters(d){
    // showGround checkbox remains in UI but ground aircraft will be shown by default
    const showGround = true;
    const minAlt = Number(document.getElementById('minAlt').value || 0);
    const country = document.getElementById('countrySelect').value;
    const minSpeed = Number(document.getElementById('minSpeed').value || 0);
    const airline = document.getElementById('airlineFilter').value;
    // ICAO filter removed

    const alt = Number(d.geo_alt_m ?? d.baro_alt_m ?? 0);
    const speed = kmhFromMs(d.spd_ms); 

    // Do not filter out ground aircraft — always show them
    if (alt < minAlt) return false;
    if (country && d.origin_country !== country) return false;
    if (speed < minSpeed) return false;
    if (airline && d.callsign && !d.callsign.startsWith(airline)) return false;

    // ICAO / callsign filtering removed

    // Le filtre temporel (heure/minute) a été retiré.

    return true;
}

function refreshCountrySelect(){
  const select = document.getElementById('countrySelect');
  const currentValue = select.value; 

  const current = new Set();
  for (const c of countries) current.add(c);
  if (currentValue && currentValue !== "") current.add(currentValue); 

  while (select.options.length > 1) select.remove(1);
  [...current].sort((a,b)=>a.localeCompare(b)).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c; select.appendChild(opt);
  });
  
  select.value = currentValue; 
}

function initAirlineFilter(){
    const select = document.getElementById('airlineFilter');
    for (const prefix in AIRLINE_PREFIXES){
        const opt = document.createElement('option');
        opt.value = prefix;
        opt.textContent = `${AIRLINE_PREFIXES[prefix]} (${prefix})`;
        select.appendChild(opt);
    }
}
initAirlineFilter(); 

// La fonction initTimeFilter() a été retirée.


function upsertMarker(d){
  const key = mkKey(d);
  const speed_class = speedClass(d.spd_ms);
  const lat = Number(d.lat), lon = Number(d.lon);
  const heading = Math.round(Number(d.hdg_deg||0));

  if (!isFinite(lat) || !isFinite(lon)) return;

  let m = aircraftMarkers.get(key);
  
  const iconHtml = `<i class="fa-solid fa-plane ${speed_class}" style="transform: rotate(${heading}deg);"></i>`;
  const iconNew = L.divIcon({
      className: 'custom-plane-icon', 
      html: iconHtml,
      iconSize: [24, 24], 
      iconAnchor: [12, 12]
  });

  if (!m){
    m = L.marker([lat, lon], { icon: iconNew })
      .on('mousemove', (e)=>showTooltip(e,d))
      .on('mouseout', hideTooltip)
      .addTo(layerGroup);
    aircraftMarkers.set(key, m);
  } else {
    m.setLatLng([lat, lon]);
    const iconElement = m.getElement();
    if (iconElement) {
        iconElement.innerHTML = iconHtml;
    }
  }
}


// Cette fonction est maintenant appelée UNIQUEMENT par processBatchAndRender
function processBatchAndRender(dataArray) {
    if (!Array.isArray(dataArray)) {
        hideLoader();
        return;
    }
    
    const isNewServerBatch = dataArray === lastDisplayedBatch; 

    countries.clear(); 
    
    let nowCount = 0;
    
    for (const [k,m] of aircraftMarkers){ layerGroup.removeLayer(m); }
    aircraftMarkers.clear();

    for (const d of dataArray){
      if (isNewServerBatch) {
        countries.add(d.origin_country || '');
        if (d.icao24) uniqueToday.add(d.icao24);
      }

      if (applyFilters(d)){ 
        upsertMarker(d);
        nowCount++;
      }
    }
    
    if (isNewServerBatch) {
        refreshCountrySelect();
    }
    
    updateKPIs(nowCount);
    
    hideLoader();
    isProcessing = false;
        try{ saveBatchToLocal(dataArray); }catch(e){}
        try{ window.dispatchEvent(new CustomEvent('skyvis:batch', { detail: { ts: Date.now(), count: nowCount } })); }catch(e){}
}

// ==============================
// GESTION DU MODE LIVE (SOCKET.IO)
// ===================================

function connectSocket() {
    // Prefer SharedWorker to keep a single socket connection alive across page navigations
    if (window.SharedWorker && !sharedPort){
        try{
            sharedWorker = new SharedWorker('/js/shared-socket.js');
            sharedPort = sharedWorker.port;
            sharedPort.onmessage = (e) => {
                const msg = e.data;
                if (!msg) return;
                if (msg.type === 'connect') statusDot.style.background = '#10b981';
                if (msg.type === 'disconnect') statusDot.style.background = '#ef4444';
                if (msg.type === 'error') console.warn('SharedWorker error:', msg.message);
                if (msg.type === 'data:update'){
                    batch.push(msg.payload);
                    clearTimeout(batchTimer);
                    batchTimer = setTimeout(flushBatch, 80);
                }
                if (msg.type === 'data:batch'){
                    if (!isProcessing) showLoader();
                    if (!Array.isArray(msg.payload)) { hideLoader(); return; }
                    batch = batch.concat(msg.payload);
                    clearTimeout(batchTimer);
                    batchTimer = setTimeout(flushBatch, 20);
                }
            };
            sharedPort.start();
            sharedPort.postMessage({cmd: 'start'});
            return;
        }catch(err){
            console.warn('SharedWorker failed, falling back to direct socket:', err);
            sharedPort = null; sharedWorker = null;
        }
    }

    // Fallback: direct socket connection in page
    if (socket && socket.connected) return;
    socket = io(SOCKET_URL, { transports:["websocket","polling"], timeout: 5000 });
    
    socket.on('connect', ()=>{ statusDot.style.background = '#10b981'; }); 
    socket.on('disconnect', ()=>{ statusDot.style.background = '#ef4444'; }); 

    socket.on('data:update', (d)=>{
        batch.push(d);
        clearTimeout(batchTimer);
        batchTimer = setTimeout(flushBatch, 80);
    });

    socket.on('data:batch', (arr)=>{
        if (!isProcessing) showLoader(); 
        if (!Array.isArray(arr)) { hideLoader(); return; }
        
        batch = batch.concat(arr);
        clearTimeout(batchTimer);
        batchTimer = setTimeout(flushBatch, 20);
    });
}

function disconnectSocket() {
    // Disconnect shared worker or page socket
    try{
        if (sharedPort){
            // Do NOT send a global 'stop' command to the SharedWorker here;
            // closing the local port detaches this page but keeps the worker/socket
            try{ sharedPort.close(); }catch(e){}
            sharedPort = null;
            // keep sharedWorker reference (worker stays running for other pages)
        }
        if (socket){ socket.disconnect(); socket = null; }
    }catch(e){}
    statusDot.style.background = '#64748b'; // Gris pour l'historique
}

function flushBatch(){
    if (!batch.length) { hideLoader(); return; }
    
    lastDisplayedBatch = [...batch]; 
    
    processBatchAndRender(lastDisplayedBatch);
    
    batch = [];
}

// ==============================
// GESTION DES SOURCES (SWITCH LIVE/HISTORIQUE)
// =============================================

function parseCsvData(csvText) {
    const data = d3.csvParse(csvText, (d) => {
        return {
            ts_iso: d.ts_iso,
            icao24: d.icao24,
            callsign: d.callsign,
            origin_country: d.origin_country,
            lon: parseFloat(d.lon),
            lat: parseFloat(d.lat),
            baro_alt_m: parseFloat(d.baro_alt_m),
            on_ground: d.on_ground === 'true', 
            spd_ms: parseFloat(d.spd_ms),
            hdg_deg: parseFloat(d.hdg_deg),
            vr_ms: parseFloat(d.vr_ms),
            geo_alt_m: parseFloat(d.geo_alt_m),
        };
    });
    return data.filter(d => isFinite(d.lat) && isFinite(d.lon));
}


async function loadHistoricalFiles() {
    try {
        const res = await fetch(`${SOCKET_URL}${API_BASE}/files`); // FIX: Utilisation de SOCKET_URL
        if (!res.ok) {
             throw new Error(`Erreur HTTP ${res.status} lors de la lecture du répertoire.`);
        }
        const files = await res.json();
        
        const fragment = document.createDocumentFragment();
        let latestFilename = null;

        // Nettoyage robuste: On enlève toutes les options après la première (qui est LIVE) et le séparateur (index 1)
        if (dataSourceSelect){
            while (dataSourceSelect.options.length > 2) { 
                dataSourceSelect.remove(2); 
            }
        }
        
        files.forEach((filename, index) => {
            const opt = document.createElement('option');
            opt.value = filename;
            const [date, time] = filename.replace('positions_', '').replace('.csv', '').split('_');
            opt.textContent = `${date} ${time.replace('-', ':')}`;
            fragment.appendChild(opt);
            
            // Le premier élément (index 0) du tableau trié en sens inverse est le plus récent.
            if (index === 0) {
                latestFilename = filename; 
            }
        });
        
        if (dataSourceSelect) dataSourceSelect.appendChild(fragment); // Ajout du fragment au sélecteur

        return latestFilename;

    } catch (error) {
        console.error("Erreur critique de chargement des fichiers historiques:", error);
        // Message visible dans le sélecteur pour l'utilisateur
        if (dataSourceSelect){
            const liveOption = dataSourceSelect.querySelector('option[value="LIVE"]');
            if (liveOption) liveOption.textContent = "LIVE (Erreur API)";
        }
        return null;
    }
}

async function switchDataSource(sourceFilename) {
    isProcessing = true;
    showLoader();
    disconnectSocket(); // Arrête toute connexion live si elle existe
    
    if (sourceFilename === "LIVE") {
        // --- Mode LIVE ---
        mapModeTitle.textContent = "Air Traffic Live — Europe";
        dataSourceSpan.textContent = "LIVE";
        
        connectSocket(); // Le rendu se fera au premier batch reçu

        // Afficher immédiatement le dernier lot s'il existe
        if (lastDisplayedBatch && lastDisplayedBatch.length > 0) {
            processBatchAndRender(lastDisplayedBatch);
        } else {
            hideLoader(); 
        }
        
    } else {
        // --- Mode HISTORIQUE ---
        mapModeTitle.textContent = `Historique — ${sourceFilename.replace('positions_', '').replace('.csv', '').replace('_', ' ').replace('-', ':')}`;
        dataSourceSpan.textContent = "HISTORIQUE";
        
        // Suppression du reset des filtres horaires
        
        try {
            const res = await fetch(`${SOCKET_URL}${API_BASE}/data/${sourceFilename}`); // FIX: Utilisation de SOCKET_URL
            if (!res.ok) throw new Error(`Échec de la récupération du fichier ${sourceFilename}.`);

            const csvText = await res.text();
            const historicalData = parseCsvData(csvText);
            
            lastDisplayedBatch = historicalData; 
            processBatchAndRender(lastDisplayedBatch);

        } catch (error) {
            console.error("Erreur de chargement des données historiques:", error);
            mapModeTitle.textContent = "Erreur de chargement historique";
            lastDisplayedBatch = [];
            processBatchAndRender([]);
        }
    }
}

// Initialisation et événements

function handleFilterChange(e){
  if (lastDisplayedBatch.length > 0) showLoader(); 
  
  if (isProcessing) return; 
  isProcessing = true;
  
  // Le délai permet de ne pas surcharger le processeur en cas de saisie rapide (input ICAO)
  setTimeout(() => { 
      processBatchAndRender(lastDisplayedBatch);
  }, 50); 
}

// ==============================
// DÉMARRAGE DE L'APPLICATION
// ==============================
async function startApp() {
    showLoader();
    // Setup BroadcastChannel for master election (prevents multiple clients across tabs)
    try{
        if ('BroadcastChannel' in window){
            bc = new BroadcastChannel('sky_air_data');
            bc.onmessage = (ev) => {
                const msg = ev.data || {};
                if (msg && msg.type === 'data:update'){
                    // receive updates from master
                    batch.push(msg.payload);
                    clearTimeout(batchTimer);
                    batchTimer = setTimeout(flushBatch, 80);
                }
                if (msg && msg.type === 'data:batch'){
                    if (!isProcessing) showLoader();
                    batch = batch.concat(msg.payload || []);
                    clearTimeout(batchTimer);
                    batchTimer = setTimeout(flushBatch, 20);
                }
                if (msg && msg.type === 'master:iam'){
                    // another tab is master
                    isMaster = false;
                }
                if (msg && msg.type === 'master:bye'){
                    // master disappeared; try to become master
                    electMaster();
                }
            };
        }
    }catch(e){/* ignore */}

    // Try to restore from local cache first so navigation is instant
    const cached = loadBatchFromLocal();
    if (cached && Array.isArray(cached.batch) && (Date.now() - cached.ts) < 120000){
        // If cached is recent (<2min), render it immediately
        lastDisplayedBatch = cached.batch;
        processBatchAndRender(lastDisplayedBatch);
        // Delay socket connect slightly to avoid duplicate immediate connects
        setTimeout(() => electMaster(), 300);
        hideLoader();
    } else {
        // No recent cache: become (or elect) a master and connect to LIVE
        electMaster();
    }

    // Leaflet needs to recalculate size when container dimensions change (or window resizes).
    // Invalidate size shortly after startup and on window load/resize to avoid zoom/stretch artifacts.
    setTimeout(() => { try{ map.invalidateSize(); }catch(e){} }, 350);
    // Also ensure we call invalidateSize after the page fully loads (helps if images/fonts changed layout)
    window.addEventListener('load', () => { try{ setTimeout(()=>map.invalidateSize(), 120); }catch(e){} });
    window.addEventListener('resize', () => { try{ map.invalidateSize(); }catch(e){} });
}

function electMaster(){
    try{
        if (!bc){
            // no BroadcastChannel: just connect
            isMaster = true; connectSocket(); return;
        }
        // ask if a master exists
        let responded = false;
        const onmsg = (ev) => { if (ev.data && ev.data.type === 'master:iam') responded = true; };
        bc.addEventListener('message', onmsg);
        // ask
        bc.postMessage({type: 'whois-master'});
        setTimeout(() => {
            bc.removeEventListener('message', onmsg);
            if (!responded){
                // become master
                isMaster = true;
                bc.postMessage({type: 'master:iam'});
                connectSocket();
            } else {
                isMaster = false;
            }
        }, 200);
    }catch(e){ isMaster = true; connectSocket(); }
}

// --- ÉVÉNEMENTS DE CONTRÔLE ---
document.getElementById('fitBtn').addEventListener('click', ()=> map.fitBounds(EUROPE_WEST_BOUNDS));

document.getElementById('countrySelect').addEventListener('change', handleFilterChange);
document.getElementById('showGround').addEventListener('change', handleFilterChange);
document.getElementById('minAlt').addEventListener('change', handleFilterChange);
document.getElementById('minSpeed').addEventListener('change', handleFilterChange);
document.getElementById('airlineFilter').addEventListener('change', handleFilterChange);
// ICAO filter removed


startApp();
// If this page was master, announce departure on unload
window.addEventListener('beforeunload', () => {
    try{ if (isMaster && bc) bc.postMessage({type: 'master:bye'}); }catch(e){}
});