# Communauto Flex Car Notify 🚗

Sick of refreshing the app or the web app for a close-by car? 
This application tracks nearby Communauto flex cars on a loop, plots them on an interactive map, dynamically routes your walking distance, and pops up a desktop notification when it finds a car that matches your criteria!

![Web App Screenshot](image/screenshot1.png)

---

## 🚀 Features
* **Modern Web Interface**: Clean, responsive, dark-mode styling.
* **Interactive Leaflet Map**: Visually tracks your location, your search radius bounds, and real-time car pins.
* **Smart Routing**: Click any car pin to instantly draw a walking route and calculate the exact travel time using OSRM data.
* **Auto-Geolocation**: Grants browser permission once, and the app will instantly boot up and auto-search your GPS coordinates on every load.
* **Background Notifications**: Get native OS desktop alerts the moment a vehicle is found.

---

## 🛠️ Installation & Usage

You can run this application either directly via Node.js or via Docker.

### Option 1: Running Locally (Node.js)
*Requires Node.js > 17.5*

1. Clone the repository and navigate into the directory.
2. Start the local server proxy:
```bash
node server.mjs
```
3. Open your browser and navigate to:
```text
http://localhost:8000
```

### Option 2: Running via Docker (Recommended)
This repository automatically builds and publishes its Docker container to the GitHub Container Registry (`ghcr.io`).

1. Pull and run the latest published container directly from GitHub:
```bash
docker run -d -p 8000:8000 --name communauto-notify ghcr.io/jeromelefeuvre/communauto-flex-webnotifier:latest
```
*(Optional: If you are hosting the app behind a reverse proxy in a sub-directory, pass the `BASE_URL` environment variable so the internal Node server routes static files correctly)*
```bash
docker run -d -p 8000:8000 -e BASE_URL=/flex1 --name communauto-notify ghcr.io/jeromelefeuvre/communauto-flex-webnotifier:latest
```

2. Open your browser and navigate to `http://localhost:8000` (or your proxy URL).

*(If you prefer to build the image manually yourself, use `docker build -t communauto-car-notify .`)*

*(To stop the server later, simply run `docker stop communauto-notify`)*

---

## 🧪 Automated Testing

This project includes a fully automated End-to-End browser testing suite powered by [Playwright](https://playwright.dev/) to ensure features like dynamic map bounding, automated UI toggles, and search loops don't break during future development.

If you are modifying the codebase and want to verify your changes haven't broken any core functionality:

1. Install the testing dependencies:
```bash
npm install
```
2. Run the automated test suite:
```bash
npm test
```

The test framework will invisibly launch a headless browser, start the local server, mock Montreal geolocation coordinates, interact with the map DOM elements, and verify the frontend logic is completely stable.

---

## 🙌 Acknowledgments

The original idea and core concept for this project started with the excellent command-line tool built by Evert:
[https://github.com/evert/communauto-car-notify](https://github.com/evert/communauto-car-notify)
