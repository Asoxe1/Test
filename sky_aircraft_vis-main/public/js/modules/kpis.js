function initKpiWidget() {
    fetch('data/static/kpis.json')
        .then(response => response.json())
        .then(data => {
            // 1. Vols Totaux
            document.getElementById('kpi-total-flights').textContent = data.totalFlights.toLocaleString();
            updateTrend('kpi-total-trend', data.totalTrend);

            // 2. Retard Moyen
            document.getElementById('kpi-avg-delay').textContent = data.avgDelay + " min";
            updateTrend('kpi-delay-trend', data.delayTrend, true); // true = inverser (baisse retard = vert)

            // 3. Passagers
            document.getElementById('kpi-passengers').textContent = data.passengers.toLocaleString();
            updateTrend('kpi-pax-trend', data.paxTrend);

            // 4. Statut
            const statusEl = document.getElementById('kpi-status');
            statusEl.textContent = data.status;
            statusEl.style.color = data.status === "Normal" ? "#10b981" : "#ef4444";
            
            // Mise à jour de l'heure
            if(data.lastUpdate) {
                document.getElementById('last-update-time').textContent = data.lastUpdate;
            }
        })
        .catch(error => console.error("Erreur chargement KPI:", error));
}

function updateTrend(elementId, value, inverseColors = false) {
    const el = document.getElementById(elementId);
    if(!el) return;
    const isPositive = value >= 0;
    let colorClass = inverseColors ? (isPositive ? 'delta-neg' : 'delta-pos') : (isPositive ? 'delta-pos' : 'delta-neg');
    const sign = isPositive ? '+' : '';
    el.innerHTML = `<span class="${colorClass}">${sign}${value}%</span> vs hier`;
}