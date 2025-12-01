# ✈️ SkyVis - Air Traffic Dashboard

Un tableau de bord interactif pour la visualisation de données aériennes en temps réel et historiques. Ce projet interdisciplinaire combine scraping de données, traitement backend avec Node.js et visualisation dynamique avec D3.js et Chart.js.

---

## 👥 Équipe et Répartition des Tâches

### 📊 Visualisations de Données Statiques
Analyse de jeux de données historiques (JSON).

* **Répartition des types d'avions**
    * *Fichier :* `aircraftTypes.js`
    * *Type :* Pie Chart (Graphique en beignet)
    * *Description :* Analyse de la flotte par modèle (Boeing, Airbus, etc.).

* **Volume de vols par compagnie**
    * *Membre :* **Laura Ferro**
    * *Fichier :* `airlineDistribution.js`
    * *Type :* Bar Chart
    * *Description :* Classement des compagnies aériennes les plus actives.

* **Volume de trafic par aéroport**
    * *Membre :* **Alexandre Coutance**
    * *Fichier :* `airportTraffic.js`
    * *Type :* Map ou Bar Chart
    * *Description :* Visualisation de la densité du trafic sur les principaux hubs.

<<<<<<< HEAD
* **Statistiques de retards**
    * *Membre :* **Qt Bebert**
    * *Fichier :* `flightDelays.js`
    * *Type :* Histogramme / Boxplot (D3.js)
    * *Description :* Analyse de la distribution des retards pour identifier les tendances.

### 📡 Données en Temps Réel
Connexion à l'API OpenSky Network.

* **Trafic Aérien Live**
    * *Membre :* **Tristan ROUCHON**
    * *Fichier :* `liveTraffic.js`
    * *Techno :* Socket.IO & D3.js
    * *Description :* Carte ou graphiques linéaires affichant les mouvements d'avions en direct.
    * *Source :* [OpenSky Network API](https://opensky-network.org/data/api)

---

## 🛠️ Technologies Utilisées

[cite_start]Ce projet respecte les contraintes techniques du module **Interdisciplinary Project 2025**[cite: 1].

* **Backend :**
    * [cite_start]**Node.js & Express.js :** Serveur et API REST[cite: 22, 25].
    * [cite_start]**Socket.IO :** Communication temps réel client-serveur pour les mises à jour live[cite: 27].
    * **Web Scraping/API Fetching :** Récupération des données depuis OpenSky et autres sources.

* **Frontend :**
    * [cite_start]**D3.js (v7) :** Manipulation du DOM basée sur les données pour les visualisations complexes (cartes, histogrammes)[cite: 24].
    * **Chart.js :** Pour les graphiques statistiques standards.
    * **HTML5 / CSS3 :** Interface responsive et moderne.

---

## 🚀 Installation et Lancement

Assurez-vous d'avoir **Node.js** installé sur votre machine.

1.  **Cloner le dépôt :**
    ```bash
    git clone [https://github.com/votre-repo/sky-aircraft-vis.git](https://github.com/votre-repo/sky-aircraft-vis.git)
    cd sky-aircraft-vis
    ```

2.  **Installer les dépendances :**
    ```bash
    npm install
    ```

3.  **Lancer le serveur :**
    ```bash
    npm start
    ```
    *Le serveur démarrera généralement sur `http://localhost:3000`.*

---

## 📂 Structure du Projet

```text
sky_aircraft_vis/
├── public/
│   ├── data/
│   │   └── static/        # Fichiers JSON (airlines, aircrafts, delays...)
│   ├── js/
│   │   ├── charts/        # Scripts de visualisation (D3.js / Chart.js)
│   │   │   ├── aircraftTypes.js
│   │   │   ├── airlineDistribution.js
│   │   │   ├── airportTraffic.js
│   │   │   ├── flightDelays.js
│   │   │   └── liveTraffic.js
│   │   └── dashboard-main.js
│   └── aviation-dashboard.html
├── server.js              # Point d'entrée serveur (Express + Socket.IO)
├── package.json
└── README.md
=======
# Lancer le serveur
npm start

public/
├── js/
│   ├── widgets/
│   │   ├── kpis.js           # Gestion des chiffres clés (haut de page)
│   │   ├── airlineChart.js   # Graphique Barres (Chart.js)
│   │   ├── aircraftChart.js  # Graphique Donut (Chart.js)
│   │   └── delayChart.js     # Graphique D3.js (Adapté de votre ancien fichier)
│   └── dashboard-main.js     # Script principal qui lance tout
>>>>>>> fbe39c62e436fcb3b6b441965a56860b08aefbab
