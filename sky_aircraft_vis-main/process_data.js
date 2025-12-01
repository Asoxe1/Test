const fs = require('fs');
const readline = require('readline');

// --- CONFIGURATION ---
const INPUT_TRAFFIC = 'public/data/static/traffic_data.csv';
const INPUT_AIRPORTS = 'public/data/static/airports.csv';
const OUTPUT_JSON = 'public/data/static/traffic_optimized.json';

const IDX_TRAFFIC_FG_APT = 7; // Colonne "fg_apt" (International)

// ON AUGMENTE ICI : Top 200 aéroports sur 20 ans
const LIMIT_TOP = 200; 
const LIMIT_YEARS = 20;

async function processData() {
    console.log(`🚀 Démarrage V6 (Mode Large : Top ${LIMIT_TOP})...`);

    // 1. Chargement Aéroports
    console.log("📖 1. Lecture de airports.csv...");
    const airportMap = await loadAirports(INPUT_AIRPORTS);
    
    if (airportMap.size === 0) {
        console.error("❌ ERREUR : Aucun aéroport chargé !");
        return;
    }

    // 2. Analyse Trafic
    console.log("🔍 2. Analyse du trafic (Ciblage des plus gros volumes)...");
    const { topCodes, startYear } = await analyzeTopAirports(INPUT_TRAFFIC);
    
    console.log(`   👉 ${topCodes.size} aéroports retenus (Période: ${startYear}-Now).`);
    
    // 3. Croisement
    console.log("✂️  3. Extraction et croisement des données...");
    const finalData = await extractDetailedData(INPUT_TRAFFIC, topCodes, startYear, airportMap);

    // 4. Sauvegarde
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalData));
    console.log(`✅ Fichier généré : ${OUTPUT_JSON} (${(fs.statSync(OUTPUT_JSON).size / 1024).toFixed(2)} KB)`);
}

function detectSeparator(line) {
    const commas = (line.match(/,/g) || []).length;
    const semicolons = (line.match(/;/g) || []).length;
    return semicolons > commas ? ';' : ',';
}

function loadAirports(filePath) {
    return new Promise((resolve) => {
        const map = new Map();
        if (!fs.existsSync(filePath)) { resolve(map); return; }

        const stream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        
        let separator = ',';
        let isFirstLine = true;

        rl.on('line', (line) => {
            if (!line.trim()) return;
            if (isFirstLine) {
                separator = detectSeparator(line);
                isFirstLine = false;
                if (line.toLowerCase().includes("code")) return;
            }

            const cols = parseCSVLine(line, separator);
            if (cols.length >= 5) {
                const code = cols[0].replace(/"/g, '').trim();
                const name = cols[1].replace(/"/g, '').trim();
                const country = cols[4].replace(/"/g, '').trim();
                const zone = cols[5] ? cols[5].replace(/"/g, '').trim() : "Unknown";
                if (code.length === 3) map.set(code, { name, country, zone });
            }
        });
        rl.on('close', () => resolve(map));
    });
}

function analyzeTopAirports(filePath) {
    return new Promise((resolve) => {
        const stream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        
        const totals = {};
        let maxYear = 0;
        let separator = ',';
        let isFirstLine = true;

        rl.on('line', (line) => {
            if (!line.trim()) return;
            if (isFirstLine) { separator = detectSeparator(line); isFirstLine = false; return; }

            const cols = parseCSVLine(line, separator);
            const year = parseInt(cols[1], 10);
            const code = cols[IDX_TRAFFIC_FG_APT];
            const total = parseNumber(cols[cols.length - 1]);

            if (!year || !code || isNaN(total)) return;
            if (year > maxYear) maxYear = year;

            totals[code] = (totals[code] || 0) + total;
        });

        rl.on('close', () => {
            const startYear = maxYear - (LIMIT_YEARS - 1);
            const sorted = Object.keys(totals)
                .sort((a, b) => totals[b] - totals[a])
                .slice(0, LIMIT_TOP);
            resolve({ topCodes: new Set(sorted), startYear });
        });
    });
}

function extractDetailedData(filePath, allowedCodes, startYear, metaMap) {
    return new Promise((resolve) => {
        const stream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        const agg = {}; 
        let separator = ',';
        let isFirstLine = true;

        rl.on('line', (line) => {
            if (!line.trim()) return;
            if (isFirstLine) { separator = detectSeparator(line); isFirstLine = false; return; }

            const cols = parseCSVLine(line, separator);
            const y = parseInt(cols[1], 10);
            const m = parseInt(cols[2], 10);
            const code = cols[IDX_TRAFFIC_FG_APT];
            const total = parseNumber(cols[cols.length - 1]);

            if (y < startYear || !allowedCodes.has(code) || isNaN(total)) return;

            const key = `${y}-${m}-${code}`;
            agg[key] = (agg[key] || 0) + total;
        });

        rl.on('close', () => {
            const output = [];
            for (const [key, v] of Object.entries(agg)) {
                const [y, m, c] = key.split('-');
                const info = metaMap.get(c) || { name: c, country: 'Unknown', zone: 'Unknown' };
                output.push({
                    y: parseInt(y), m: parseInt(m), c: c,
                    n: info.name, ct: info.country, z: info.zone, v: v
                });
            }
            resolve(output);
        });
    });
}

function parseCSVLine(text, separator) {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '"') inQuotes = !inQuotes;
        else if (text[i] === separator && !inQuotes) {
            result.push(text.substring(start, i).trim());
            start = i + 1;
        }
    }
    result.push(text.substring(start).trim());
    return result;
}

function parseNumber(str) {
    return str ? parseInt(str.replace(/,/g, '').replace(/"/g, '').replace(/ /g, ''), 10) : 0;
}

processData().catch(console.error);