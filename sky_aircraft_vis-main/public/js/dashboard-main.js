document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Dashboard initialisé.");
    
    // On lance chaque widget un par un
    // Le try/catch évite que le plantage d'un graphique ne casse tout le reste
    
    // 1. Les chiffres du haut (KPIs)
    try { 
        if(typeof initKpiWidget === 'function') initKpiWidget(); 
    } catch(e) { console.error("Erreur KPI:", e); }

    // 2. Graphique Compagnies (Barres)
    try { 
        if(typeof initAirportChart === 'function') initAirportChart(); 
    } catch(e) { console.error("Erreur Airline:", e); }

    // 3. Graphique Avions (Donut)
    try { 
        if(typeof initAircraftChart === 'function') initAircraftChart(); 
    } catch(e) { console.error("Erreur Aircraft:", e); }

    // 4. Graphique Retards (D3.js)
    try { 
        if(typeof initDelayChart === 'function') initDelayChart(); 
    } catch(e) { console.error("Erreur Delay:", e); }
});

// Fonction appelée par le bouton "Actualiser"
function refreshData() {
    console.log("🔄 Rafraîchissement des données...");
    // Pour l'instant, on relance juste les inits pour simuler
    initKpiWidget();
    initAirportChart();
    initAircraftChart();
    initDelayChart();
}