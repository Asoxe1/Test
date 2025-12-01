const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = 3000;

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve scrapping static UI (map / real-time viewer) under /scrapping
app.use('/scrapping', express.static(path.join(__dirname, 'scrapping')));

// Proxy historical HTTP API and socket.io websocket to scrapping service on port 8000
// This keeps the frontend using same-origin URLs while forwarding requests to the
// separate scrapping/socket server (which remains a separate process).
const SCRAPPING_TARGET = 'http://localhost:8000';
app.use('/api/historical', createProxyMiddleware({
    target: SCRAPPING_TARGET,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn'
}));

// Proxy socket.io path for websocket upgrade requests
app.use('/socket.io', createProxyMiddleware({
    target: SCRAPPING_TARGET,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn'
}));

// Redirect root to main dashboard page (provides a default for GET /)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/aviation-dashboard.html'));
});
// Friendly routes for dashboards (support URLs without .html)
app.get('/live', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/aviation-live-dashboard.html'));
});
app.get('/historical', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/aviation-historical.html'));
});
// Database setup
const dbPath = path.join(__dirname, '../data/aviation.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the aviation SQLite database.');
});

// API endpoints
app.get('/api/airports', (req, res) => {
    db.all('SELECT * FROM airports', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});

app.get('/api/aircraft', (req, res) => {
    db.all('SELECT * FROM aircraft', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});

app.get('/api/flight_delays', (req, res) => {
    db.all('SELECT * FROM flight_delays', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});

app.get('/api/kpis', (req, res) => {
    db.all('SELECT * FROM kpis', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});

// Serve traffic optimized JSON used by airport traffic chart
app.get('/api/traffic_optimized', (req, res) => {
    const filePath = path.join(__dirname, '../data/traffic_optimized.json');
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(500).json({ error: 'Unable to read traffic data' });
        }
    });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
