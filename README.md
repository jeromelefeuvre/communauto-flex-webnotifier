# Communauto Car Notify 🚗

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
If you don't want to install Node.js locally, you can run the entire application completely containerized.

1. Build the lightweight Docker image:
```bash
docker build -t communauto-car-notify .
```
2. Run the container:
```bash
docker run -d -p 8000:8000 --name communauto-notify communauto-car-notify
```
3. Open your browser and navigate to `http://localhost:8000`.

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
