function initKpiWidget(data) {
    // 1. Vols Totaux
    document.getElementById('kpi-total-flights').textContent = data.find(d => d.name === 'totalFlights').value.toLocaleString();
    updateTrend('kpi-total-trend', data.find(d => d.name === 'totalTrend').value);

    // 2. Retard Moyen
    document.getElementById('kpi-avg-delay').textContent = data.find(d => d.name === 'avgDelay').value + " min";
    updateTrend('kpi-delay-trend', data.find(d => d.name === 'delayTrend').value, true); // true = inverser (baisse retard = vert)

    // 3. Passagers
    document.getElementById('kpi-passengers').textContent = data.find(d => d.name === 'passengers').value.toLocaleString();
    updateTrend('kpi-pax-trend', data.find(d => d.name === 'paxTrend').value);

    // 4. Statut
    const statusEl = document.getElementById('kpi-status');
    const statusData = data.find(d => d.name === 'status');
    statusEl.textContent = statusData.value;
    statusEl.style.color = statusData.value === "Normal" ? "#10b981" : "#ef4444";

    // Mise à jour de l'heure
    const lastUpdateData = data.find(d => d.name === 'lastUpdate');
    if (lastUpdateData) {
        document.getElementById('last-update-time').textContent = lastUpdateData.value;
    }
}

function updateTrend(elementId, value, inverseColors = false) {
    const el = document.getElementById(elementId);
    if(!el) return;
    const isPositive = value >= 0;
    let colorClass = inverseColors ? (isPositive ? 'delta-neg' : 'delta-pos') : (isPositive ? 'delta-pos' : 'delta-neg');
    const sign = isPositive ? '+' : '';
    el.innerHTML = `<span class="${colorClass}">${sign}${value}%</span> vs hier`;
}