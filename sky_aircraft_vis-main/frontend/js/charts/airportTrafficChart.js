function initAirportChart(data) {
    const containerId = 'container-airport-chart';
    const ctxContainer = document.getElementById(containerId);
    if (!ctxContainer) return;

    // Tri des années
    const years = [...new Set(data.map(d => d.y))].sort((a, b) => b - a);

    // Liste des zones (Continents)
    const zoneNames = {
        "EU": "Europe", "NA": "Amérique du Nord", "AS": "Asie",
        "SA": "Amérique du Sud", "AF": "Afrique", "OC": "Océanie"
    };
    const availableZones = [...new Set(data.map(d => d.z))].filter(z => z && z !== "Unknown").sort();

    // Création de l'interface
    setupAdvancedFilters(ctxContainer, years, availableZones, zoneNames, (filters) => {
        updateChart(data, filters);
    });

    // Canvas
    const chartWrapper = document.createElement('div');
    chartWrapper.style.cssText = 'position: relative; height: 350px; width: 100%;';
    chartWrapper.innerHTML = '<canvas id="airportCanvas"></canvas>';
    ctxContainer.appendChild(chartWrapper);
    ctxContainer.classList.add('loaded');

    // Init : Toutes les années, Monde entier (au lieu de la dernière année)
    updateChart(data, { year: "All", zone: "All" });
}

function setupAdvancedFilters(container, years, zones, zoneNames, onFilterChange) {
    container.innerHTML = ''; 
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'margin-bottom: 15px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;';

    const createSelect = (id, options, defaultText) => {
        const sel = document.createElement('select');
        sel.className = 'chart-select';
        sel.style.cssText = "padding: 8px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1e293b; font-size: 0.9rem; cursor: pointer;";
        sel.id = `filter-${id}`;
        sel.innerHTML = `<option value="All">${defaultText}</option>` + options;
        sel.addEventListener('change', gatherValues);
        return sel;
    };

    // 1. Année
    controlsDiv.appendChild(createSelect('year', years.map(y => `<option value="${y}">${y}</option>`).join(''), "Toutes années"));
    
    // 3. Continent
    const zoneOpts = zones.map(z => `<option value="${z}">${zoneNames[z] || z}</option>`).join('');
    controlsDiv.appendChild(createSelect('zone', zoneOpts, "Tous Continents"));

    // Le filtre par pays a été retiré.

    container.appendChild(controlsDiv);

    function gatherValues() {
        onFilterChange({
            year: document.getElementById('filter-year').value,
            zone: document.getElementById('filter-zone').value
        });
    }
}

let airportChartInstance = null;

function updateChart(data, filters) {
    // 1. Filtrage
    let filtered = data;
    if (filters.year !== "All") filtered = filtered.filter(d => d.y == filters.year);
    if (filters.zone !== "All") filtered = filtered.filter(d => d.z === filters.zone);

    // La mise à jour dynamique du sélecteur de pays a été retirée.

    // 2. Agrégation
    const stats = {};
    const names = {};
    filtered.forEach(row => {
        stats[row.c] = (stats[row.c] || 0) + row.v;
        if (!names[row.c] && row.n) names[row.c] = { n: row.n, ct: row.ct };
    });

    // 3. Top 10
    const chartData = Object.keys(stats)
        .map(code => {
            const info = names[code] || { n: code, ct: '?' };
            return {
                // Affichage : Nom Aéroport (Code Pays)
                label: `${info.n} (${info.ct})`,
                volume: stats[code]
            };
        })
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);

    // 4. Rendu
    const ctx = document.getElementById('airportCanvas').getContext('2d');
    
    // --- CRÉATION DU DÉGRADÉ BLEU ---
    // Un dégradé horizontal qui va de gauche (0) à droite (width du chart)
    // Bleu Profond (#1e3a8a) vers Bleu Ciel (#38bdf8)
    let gradient = ctx.createLinearGradient(0, 0, 600, 0);
    gradient.addColorStop(0, '#1e40af'); // Bleu foncé
    gradient.addColorStop(1, '#60a5fa'); // Bleu clair

    if (airportChartInstance) airportChartInstance.destroy();

    airportChartInstance = new Chart(ctx, {
        type: 'bar',
        indexAxis: 'y', // Horizontal
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: 'Passagers',
                data: chartData.map(d => d.volume),
                backgroundColor: gradient, // Application du dégradé
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${c.formattedValue} Passagers`
                    }
                }
            },
            scales: { 
                x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                y: { grid: { display: false } }
            }
        }
    });
}