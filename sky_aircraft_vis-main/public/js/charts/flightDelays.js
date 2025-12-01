function initDelayChart() {
    const containerId = "#container-delay-viz";
    const container = document.querySelector(containerId);
    
    if (!container) return;
    
    container.innerHTML = ""; // Vide le texte "En attente..."
    container.classList.add('loaded');

    // Chargement du JSON
    d3.json("data/static/flightDelays.json").then(data => {
        const margin = { top: 20, right: 20, bottom: 30, left: 40 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        const svg = d3.select(containerId)
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const delays = data.map(d => +d.delay);
        
        // Echelle X
        const x = d3.scaleLinear()
            .domain([0, d3.max(delays)])
            .range([0, width]);

        const histogram = d3.histogram()
            .value(d => d)
            .domain(x.domain())
            .thresholds(x.ticks(20));

        const bins = histogram(delays);

        // Echelle Y
        const y = d3.scaleLinear()
            .domain([0, d3.max(bins, d => d.length)])
            .range([height, 0]);

        // Barres
        svg.selectAll("rect")
            .data(bins)
            .enter()
            .append("rect")
            .attr("x", 1)
            .attr("transform", d => `translate(${x(d.x0)},${y(d.length)})`)
            .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
            .attr("height", d => height - y(d.length))
            .style("fill", "#3b82f6");

        // Axes
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x));
            
        svg.append("g")
            .call(d3.axisLeft(y));

    }).catch(err => {
        console.error("Erreur D3:", err);
        container.innerHTML = "Erreur de chargement données";
    });
}