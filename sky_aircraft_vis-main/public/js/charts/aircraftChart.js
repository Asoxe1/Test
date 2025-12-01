function initAircraftChart() {
    const ctxContainer = document.getElementById('container-aircraft-chart');
    if(!ctxContainer) return;

    fetch('data/static/aircraft.json')
        .then(response => response.json())
        .then(data => {
            ctxContainer.innerHTML = '<canvas id="aircraftCanvas"></canvas>';
            ctxContainer.classList.add('loaded');

            const labels = data.map(d => d.type);
            const values = data.map(d => d.count);

            new Chart(document.getElementById('aircraftCanvas'), {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#94a3b8'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 12 } }
                    }
                }
            });
        });
}