document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Dashboard initialisé.");

    // Define a generic data fetching function
    const fetchData = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    };

    // Initialize all widgets
    const initWidgets = async () => {
        try {
            // 1. KPIs
            if (typeof initKpiWidget === 'function') {
                const kpiData = await fetchData('/api/kpis');
                initKpiWidget(kpiData.data);
            }
            // 2. Airport Traffic Chart (traffic_optimized JSON)
            if (typeof initAirportChart === 'function') {
                const trafficData = await fetchData('/api/traffic_optimized');
                // `traffic_optimized.json` is returned directly as JSON (not wrapped),
                // ensure we pass the raw array/object to the chart initializer
                initAirportChart(trafficData);
            }
            // 3. Aircraft Chart
            if (typeof initAircraftChart === 'function') {
                const aircraftData = await fetchData('/api/aircraft');
                initAircraftChart(aircraftData.data);
            }
            // 4. Flight Delays Chart
            if (typeof initDelayChart === 'function') {
                const delayData = await fetchData('/api/flight_delays');
                initDelayChart(delayData.data);
            }
        } catch (error) {
            console.error("Error initializing widgets:", error);
        }
    };

    initWidgets();

    // Function called by the "Actualiser" button
    window.refreshData = initWidgets;
});