const branchIds = {
    montreal: 1,
    quebec: 2,
    toronto: 3,
};

const earthRadius = 6371; // In km

// UI Controller
const UIController = {
    els: {
        form: document.getElementById('notify-form'),
        btnStart: document.getElementById('btn-start'),
        btnStop: document.getElementById('btn-stop'),
        btnGeo: document.getElementById('btn-geolocation'),
        locationInput: document.getElementById('location'),
        statusContainer: document.getElementById('status-container'),
        statusText: document.getElementById('status-text'),
        resultsContainer: document.getElementById('results-container'),
        city: document.getElementById('city'),
        distance: document.getElementById('distance'),
        delay: document.getElementById('delay'),
        mapWrapper: document.getElementById('map-wrapper')
    },

    toggleSearching: function () {
        this.els.btnStart.classList.add('hidden');
        this.els.btnStop.classList.remove('hidden');
        this.els.statusContainer.classList.remove('hidden');
        this.els.resultsContainer.innerHTML = '';
        this.els.mapWrapper.classList.remove('hidden');

        this.els.city.disabled = true;
        this.els.distance.disabled = true;
        this.els.delay.disabled = true;
        this.els.locationInput.disabled = true;
        this.els.btnGeo.disabled = true;
    },

    toggleStopped: function () {
        this.els.btnStart.classList.remove('hidden');
        this.els.btnStop.classList.add('hidden');
        this.els.statusContainer.classList.add('hidden');

        this.els.city.disabled = false;
        this.els.distance.disabled = false;
        this.els.delay.disabled = false;
        this.els.locationInput.disabled = false;
        this.els.btnGeo.disabled = false;
    },

    updateStatus: function (text) {
        this.els.statusText.innerText = text;
    },

    showSuccessCar: function (car, city) {
        const bookingUrl = `https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`;
        this.els.resultsContainer.innerHTML = `
            <div class="car-card" id="success-car-card">
                <div class="car-info">
                    <h3>${car.brand} ${car.model}</h3>
                    <p id="car-card-desc">${Math.floor(car.distance)}m away (straight line) • Plate: ${car.plate} • ${car.color}</p>
                </div>
                <a href="${bookingUrl}" target="_blank" class="book-btn">Reserve</a>
            </div>
        `;
    },

    updateCarUIWithWalkingData: function (car, walkDistanceStr, walkMins) {
        const cardDesc = document.getElementById('car-card-desc');
        if (cardDesc) {
            cardDesc.innerText = `${walkDistanceStr} walking (${walkMins} min) • Plate: ${car.plate} • ${car.color}`;
        }
    }
};

const AppState = {
    isFirstInitEvent: true,
    isSearching: false,
    searchTimeout: null,
    currentDistanceRadius: 600,
    userLocation: null,
    lastSearchLocation: null
};

// Map Controller
const MapController = {
    map: null,
    carMarkers: [],
    userMarker: null,
    searchCircle: null,
    activeRoute: null,
    lastRoutedCoord: null,

    init: function (lat, lng) {
        if (this.map) return;
        this.map = L.map('map').setView([lat, lng], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        // Render circle but DO NOT fitBounds yet! DOM layout must calculate first.
        this.updateCenter(lat, lng, false);
    },

    updateCenter: function (lat, lng, fitBounds = true) {
        if (!this.map) return;

        if (this.userMarker) this.map.removeLayer(this.userMarker);
        this.userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: "<div style='background-color:#3b82f6; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 4px rgba(0,0,0,0.4);'></div>",
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map).bindPopup("<b>Your Location</b>");

        if (this.searchCircle) this.map.removeLayer(this.searchCircle);
        this.searchCircle = L.circle([lat, lng], {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            weight: 2,
            radius: AppState.currentDistanceRadius
        }).addTo(this.map);

        if (fitBounds) {
            this.map.fitBounds(this.searchCircle.getBounds(), { padding: [20, 20] });
        }
    },

    drawCars: function (filteredCars, city) {
        if (!this.map) return;

        this.carMarkers.forEach(m => this.map.removeLayer(m));
        this.carMarkers = [];

        const carIcon = L.icon({
            iconUrl: 'proxy-image?url=' + encodeURIComponent('https://www.reservauto.net/images/GoogleMaps/pin-am.png'),
            iconSize: [20, 27],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18]
        });

        filteredCars.forEach(car => {
            const marker = L.marker([car.lat, car.lng], { icon: carIcon }).addTo(this.map);
            marker.bindPopup(`<b>${car.brand} ${car.model}</b><br>${Math.floor(car.distance)}m away (straight line)<br>Plate: ${car.plate}`);

            marker.on('click', () => {
                this.drawRouteToCar(AppState.userLocation[0], AppState.userLocation[1], car.lat, car.lng).then(routeData => {
                    if (routeData) {
                        UIController.updateCarUIWithWalkingData(car, MathUtils.humanDistance(routeData.distance), Math.round(routeData.duration / 60));
                        marker.setPopupContent(`<b>${car.brand} ${car.model}</b><br>${MathUtils.humanDistance(routeData.distance)} walk (${Math.round(routeData.duration / 60)} min)<br>Plate: ${car.plate}`);
                    }
                });
            });

            this.carMarkers.push(marker);
        });
    },

    drawRouteToCar: async function (startLat, startLng, endLat, endLng) {
        if (!this.map) return null;
        const coordString = `${endLat},${endLng}`;
        if (this.lastRoutedCoord === coordString) return null;

        if (this.activeRoute) this.map.removeLayer(this.activeRoute);
        this.lastRoutedCoord = coordString;

        try {
            const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
                const routeGeoJSON = data.routes[0].geometry;
                this.activeRoute = L.geoJSON(routeGeoJSON, {
                    style: { color: '#3b82f6', weight: 6, opacity: 0.8, dashArray: '10, 10' }
                }).addTo(this.map);

                this.map.fitBounds(this.activeRoute.getBounds(), { padding: [50, 50] });

                return {
                    distance: data.routes[0].distance,
                    duration: data.routes[0].duration
                };
            }
        } catch (e) {
            console.error("Could not fetch route", e);
        }
        return null;
    },

    clearRoutes: function () {
        if (this.activeRoute) this.map.removeLayer(this.activeRoute);
        this.activeRoute = null;
        this.lastRoutedCoord = null;
    }
};

// Ask for notification permission early
if (window.Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
}

window.addEventListener('DOMContentLoaded', () => {
    // Fetch and display the app version
    fetch('api/version')
        .then(res => res.json())
        .then(data => {
            if (data.version && data.version !== 'unknown' && data.version !== 'error') {
                document.getElementById('app-version').textContent = 'v' + data.version;
            }
        })
        .catch(() => console.warn("Could not fetch app version"));

    // If geolocation permission is already granted, auto-fetch the user's location
    if (navigator.permissions && navigator.geolocation) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
            if (result.state === 'granted') {
                UIController.els.btnGeo.click();
            }
        });
    }
});

UIController.els.distance.addEventListener('input', (e) => {
    if (AppState.isSearching) return;
    const newRadius = parseInt(e.target.value);
    if (!isNaN(newRadius) && MapController.searchCircle && MapController.map) {
        MapController.searchCircle.setRadius(newRadius);
    }
});

UIController.els.btnGeo.addEventListener('click', async () => {
    UIController.els.btnGeo.disabled = true;
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        UIController.els.locationInput.value = `${lat},${lng}`;
        AppState.userLocation = [parseFloat(lat), parseFloat(lng)];

        // Automatically start the search once the location is successfully found
        UIController.els.btnStart.click();
    } catch (err) {
        alert("Could not get location. Ensure your browser has location permissions enabled for this site, or type it manually (lat,lng).");
    } finally {
        UIController.els.btnGeo.disabled = false;
    }
});

UIController.els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (AppState.isSearching) return;

    // Permissions check
    if (window.Notification && Notification.permission !== "granted") {
        await Notification.requestPermission();
    }

    const city = UIController.els.city.value;
    const initialDistance = parseInt(UIController.els.distance.value);
    const delay = parseInt(UIController.els.delay.value) * 1000;
    const locString = UIController.els.locationInput.value;

    if (locString) {
        AppState.userLocation = locString.split(',').map(c => parseFloat(c.trim()));
    } else {
        alert("Please provide a location or use the GPS button.");
        return;
    }

    const isSameLocation = AppState.lastSearchLocation && AppState.lastSearchLocation[0] === AppState.userLocation[0] && AppState.lastSearchLocation[1] === AppState.userLocation[1];
    AppState.lastSearchLocation = [...AppState.userLocation];

    AppState.currentDistanceRadius = initialDistance;
    AppState.isSearching = true;

    UIController.toggleSearching();

    let shouldFitBounds = false;

    if (!MapController.map) {
        MapController.init(AppState.userLocation[0], AppState.userLocation[1]);
        // Map is newly created, we definitely must fit bounds, but ONLY after invalidated.
        shouldFitBounds = true;
    } else {
        // If it's a new location, always fit bounds.
        shouldFitBounds = !isSameLocation;

        if (isSameLocation && MapController.searchCircle) {
            // Temporarily update circle to get new bounds without drawing yet
            MapController.searchCircle.setRadius(initialDistance);
            const circleBounds = MapController.searchCircle.getBounds();
            const mapBounds = MapController.map.getBounds();

            // Only fit bounds if we are zoomed OUT or panned away
            if (!circleBounds.contains(mapBounds)) {
                shouldFitBounds = true;
            }
        }

        MapController.updateCenter(AppState.userLocation[0], AppState.userLocation[1], false);
    }


    const executeSearch = () => {
        if (!AppState.isSearching) return; // Abort if user clicked stop before layout tick finished

        MapController.map.invalidateSize();
        if (shouldFitBounds && MapController.searchCircle) {
            MapController.map.fitBounds(MapController.searchCircle.getBounds(), { padding: [20, 20] });
        }
        AppController.searchLoop(city, delay);
    };

    if (AppState.isFirstInitEvent) {
        AppState.isFirstInitEvent = false;
        setTimeout(executeSearch, 100);
    } else {
        executeSearch();
    }
});

UIController.els.btnStop.addEventListener('click', () => {
    stopSearch();
});

function stopSearch(message) {
    AppState.isSearching = false;
    clearTimeout(AppState.searchTimeout);

    UIController.toggleStopped();

    MapController.clearRoutes();

    if (message) alert(message);
}

const AppController = {
    searchLoop: async function (city, delay) {
        if (!AppState.isSearching) return;

        const branchId = branchIds[city];

        try {
            UIController.updateStatus(`Fetching cars for ${city}...`);

            // Fetch via local proxy to bypass CORS
            const url = `api/cars?BranchID=${branchId}&LanguageID=2`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Proxy server error");

            const json = await res.json();

            // If the user stopped the search while this fetch was in-flight, discard the stale response safely.
            if (!AppState.isSearching) return;

            const cars = json.d.Vehicles.map(vehicle => ({
                brand: vehicle.CarBrand,
                model: vehicle.CarModel,
                plate: vehicle.CarPlate,
                color: vehicle.CarColor,
                lat: vehicle.Latitude,
                lng: vehicle.Longitude,
                distance: MathUtils.calculateDistance(AppState.userLocation[0], AppState.userLocation[1], vehicle.Latitude, vehicle.Longitude),
            }));

            const alertCars = cars
                .filter(car => car.distance <= AppState.currentDistanceRadius)
                .sort((a, b) => a.distance - b.distance);

            const mapCars = cars
                .filter(car => car.distance <= AppState.currentDistanceRadius + 200)
                .sort((a, b) => a.distance - b.distance);

            MapController.drawCars(mapCars, city);

            UIController.updateStatus(`${cars.length} cars found. ${alertCars.length} within ${MathUtils.humanDistance(AppState.currentDistanceRadius)} (${mapCars.length} map total). Waiting...`);

            if (alertCars.length > 0) {
                const car = alertCars[0];

                UIController.showSuccessCar(car, city);
                this.sendDesktopNotification(car, city);

                stopSearch();
                return;
            } else {
                UIController.els.resultsContainer.innerHTML = ''; // Clear stale results
            }

        } catch (err) {
            console.error(err);
            UIController.updateStatus("Error fetching cars. Retrying...");
        }

        if (AppState.isSearching) {
            AppState.searchTimeout = setTimeout(() => this.searchLoop(city, delay), delay);
        }
    },

    sendDesktopNotification: function (car, city) {
        if (!window.Notification || Notification.permission !== "granted") return;

        const notification = new Notification("Communauto Found!", {
            body: `${car.brand} ${car.model} is ${Math.floor(car.distance)}m away.`,
            icon: 'https://communauto.com/wp-content/uploads/2021/03/cropped-favicon-32x32.png',
            requireInteraction: true
        });

        notification.onclick = () => {
            window.open(`https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`, '_blank');
            notification.close();
        };
    }
};




// Math Helpers
const MathUtils = {
    calculateDistance: function (lat1, lng1, lat2, lng2) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c * 1000;
    },

    toRadians: function (degrees) {
        return degrees * (Math.PI / 180);
    },

    humanDistance: function (inp) {
        if (inp < 1000) return inp + 'm';
        return (inp / 1000) + 'km';
    }
};

// Expose internal controllers to global window for E2E testing
window.AppState = AppState;
window.MapController = MapController;
window.UIController = UIController;
