const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

const dbPath = path.join(__dirname, '../data/aviation.db');
const db = new sqlite3.Database(dbPath);

const airportsCsvPath = path.join(__dirname, '../data/airports.csv');
const aircraftJsonPath = path.join(__dirname, '../data/aircraft.json');
const flightDelaysJsonPath = path.join(__dirname, '../data/flightDelays.json');
const kpisJsonPath = path.join(__dirname, '../data/kpis.json');

const readCsv = (filePath) => {
    return new Promise((resolve, reject) => {
        const data = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', () => {
                resolve(data);
            })
            .on('error', (err) => {
                reject(err);
            });
    });
};

const importData = async () => {
    try {
        await new Promise((resolve, reject) => {
            db.serialize(async () => {
                // Create tables
                db.run(`CREATE TABLE IF NOT EXISTS airports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    city TEXT,
                    country TEXT,
                    iata TEXT,
                    icao TEXT,
                    latitude REAL,
                    longitude REAL,
                    altitude INTEGER,
                    timezone TEXT,
                    dst TEXT,
                    tz_database_time_zone TEXT,
                    type TEXT,
                    source TEXT
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS aircraft (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    manufacturer TEXT,
                    model TEXT,
                    count INTEGER
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS flight_delays (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    airline TEXT,
                    delay INTEGER
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS kpis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    value REAL
                )`);

                // Import airports data
                const airportsData = await readCsv(airportsCsvPath);
                airportsData.forEach((row) => {
                    db.run(`INSERT INTO airports (name, city, country, iata, icao, latitude, longitude, altitude, timezone, dst, tz_database_time_zone, type, source)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [row.name, row.city, row.country, row.iata, row.icao, row.latitude, row.longitude, row.altitude, row.timezone, row.dst, row.tz_database_time_zone, row.type, row.source]);
                });
                console.log('CSV data for airports has been processed.');

                // Import aircraft data
                const aircraftData = JSON.parse(fs.readFileSync(aircraftJsonPath, 'utf8'));
                aircraftData.forEach((item) => {
                    db.run(`INSERT INTO aircraft (manufacturer, model, count) VALUES (?, ?, ?)`,
                        [item.manufacturer, item.model, item.count]);
                });
                console.log('JSON data for aircraft has been processed.');

                // Import flight delays data
                const flightDelaysData = JSON.parse(fs.readFileSync(flightDelaysJsonPath, 'utf8'));
                flightDelaysData.forEach((item) => {
                    db.run(`INSERT INTO flight_delays (airline, delay) VALUES (?, ?)`,
                        [item.airline, item.delay]);
                });
                console.log('JSON data for flight delays has been processed.');

                // Import kpis data
                const kpisData = JSON.parse(fs.readFileSync(kpisJsonPath, 'utf8'));
                for (const key in kpisData) {
                    db.run(`INSERT INTO kpis (name, value) VALUES (?, ?)`,
                        [key, kpisData[key]]);
                }
                console.log('JSON data for kpis has been processed.');

                resolve();
            });
        });
    } catch (err) {
        console.error(err.message);
    } finally {
        db.close((err) => {
            if (err) {
                return console.error(err.message);
            }
            console.log('Closed the database connection.');
        });
    }
};

importData();
