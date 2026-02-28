const AppState = {
    isFirstInitEvent: true,
    isSearching: false,
    searchTimeout: null,
    currentDistanceRadius: 600,
    userLocation: null,
    lastSearchLocation: null,
    detectedCity: null
};

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

    // Initialize the smart location controller (GPS probe + autocomplete wiring)
    LocationController.init();
});

UIController.els.distance.addEventListener('input', (e) => {
    const newRadius = parseInt(e.target.value);

    // Always update the visual text UI instantly when slider drags
    if (UIController.els.distanceValue) {
        UIController.els.distanceValue.innerText = newRadius + 'm';
    }

    if (AppState.isSearching) return;
    if (!isNaN(newRadius) && MapController.searchCircle && MapController.map) {
        MapController.searchCircle.setRadius(newRadius);
        // Automatically zoom the map to gracefully fit the newly sized circle bounds
        MapController.map.fitBounds(MapController.searchCircle.getBounds(), MapController.getFitPadding());
    }
});


UIController.els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (AppState.isSearching) return;

    // Request notification permission if not yet decided.
    // Don't await — the promise may never resolve when called outside a user gesture (e.g., GPS auto-start).
    if (window.Notification && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { });
    }

    const city = AppState.detectedCity;
    if (!city) {
        UIController.showCityError();
        const badge = UIController.els.cityBadge;
        badge.classList.remove('shake');
        void badge.offsetWidth; // force reflow to restart animation
        badge.classList.add('shake');
        return;
    }
    const initialDistance = parseInt(UIController.els.distance.value);
    const delay = parseInt(UIController.els.delay.value) * 1000;
    // AppState.userLocation is set by LocationController (via GPS or address selection).
    // Fall back to parsing the hidden location field if AppState hasn't been set yet.
    if (!AppState.userLocation) {
        const locString = UIController.els.locationInput.value;
        if (locString) {
            AppState.userLocation = locString.split(',').map(c => parseFloat(c.trim()));
        }
    }

    const isSameLocation = AppState.lastSearchLocation && AppState.lastSearchLocation[0] === AppState.userLocation[0] && AppState.lastSearchLocation[1] === AppState.userLocation[1];
    AppState.lastSearchLocation = [...AppState.userLocation];

    AppState.currentDistanceRadius = initialDistance;
    AppState.isSearching = true;

    UIController.updateFilterText(city, initialDistance);
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
            MapController.map.fitBounds(MapController.searchCircle.getBounds(), MapController.getFitPadding());
        }
        AppController.searchLoop(city, delay);
    };

    if (AppState.isFirstInitEvent) {
        AppState.isFirstInitEvent = false;
        setTimeout(executeSearch, 100);
    } else {
        executeSearch();
    }

    // Fire-and-forget background push (safety net if user closes the app)
    BackgroundAlert.subscribe();
});

UIController.els.btnStop.addEventListener('click', () => {
    stopSearch();
});

UIController.els.floatingSearchBar.addEventListener('click', () => {
    UIController.expandForm();
});

document.getElementById('btn-filter').addEventListener('click', () => {
    const filters = document.getElementById('form-filters');
    const btn = document.getElementById('btn-filter');
    filters.classList.toggle('hidden');
    btn.classList.toggle('active');
});

function stopSearch(message) {
    AppState.isSearching = false;
    clearTimeout(AppState.searchTimeout);

    UIController.toggleStopped();
    BackgroundAlert.unsubscribe();

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

            UIController.updateStatus(`${cars.length} cars found.\n${alertCars.length} within ${MathUtils.humanDistance(AppState.currentDistanceRadius)} (${mapCars.length} map total). Waiting...`);

            if (alertCars.length > 0) {
                const topCars = alertCars.slice(0, 3); // Take up to 3 cars

                UIController.showSuccessCars(topCars, city);
                this.sendDesktopNotification(topCars, city);

                stopSearch();

                // Fetch walking distances for all cars in parallel and update UI as each resolves
                topCars.forEach(car => {
                    MapController.getWalkingDistance(AppState.userLocation[0], AppState.userLocation[1], car.lat, car.lng).then(walkData => {
                        if (walkData) {
                            UIController.updateCarUIWithWalkingData(car, MathUtils.humanDistance(walkData.distance), Math.round(walkData.duration / 60));
                        }
                    });
                });

                // When only one car found, auto-select it to draw the walking route on the map
                if (topCars.length >= 1) {
                    const firstCard = document.querySelector('.car-card');
                    if (firstCard) firstCard.click();
                }

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

    sendDesktopNotification: function (cars, city) {
        if (!window.Notification || Notification.permission !== "granted") return;

        const primaryCar = cars[0];
        const title = cars.length > 1 ? `Communauto Found ${cars.length} Cars!` : "Communauto Found!";
        const body = cars.length > 1
            ? `Closest: ${primaryCar.brand} ${primaryCar.model} (${Math.floor(primaryCar.distance)}m away)`
            : `${primaryCar.brand} ${primaryCar.model} is ${Math.floor(primaryCar.distance)}m away.`;

        const notification = new Notification(title, {
            body: body,
            icon: 'static/images/favicon-32x32.png',
            requireInteraction: true
        });

        notification.onclick = () => {
            window.open(getBookingUrl(city), '_blank');
            notification.close();
        };
    }
};

// ========== BACKGROUND ALERT (Web Push) ==========

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const BackgroundAlert = {
    storageKey: 'bg_alert_id',

    isActive: function () {
        return !!localStorage.getItem(this.storageKey);
    },

    subscribe: async function () {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (!AppState.userLocation) return;

        const city = AppState.detectedCity;
        const radius = parseInt(UIController.els.distance.value);
        const [lat, lng] = AppState.userLocation;

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;

            const keyRes = await fetch('api/push/vapid-public-key');
            const { publicKey } = await keyRes.json();
            if (!publicKey) return;

            const sw = await navigator.serviceWorker.ready;
            const pushSubscription = await sw.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            const res = await fetch('api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pushSubscription, city, lat, lng, radius })
            });
            const { id } = await res.json();
            localStorage.setItem(this.storageKey, id);
            this._showIndicator();
            console.log('[BackgroundAlert] Subscribed:', id);
        } catch (err) {
            console.error('[BackgroundAlert] Subscribe error:', err.message);
        }
    },

    unsubscribe: async function () {
        const id = localStorage.getItem(this.storageKey);
        if (id) {
            fetch('api/push/unsubscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            }).catch(err => console.error('[BackgroundAlert] Unsubscribe failed:', err));
        }
        localStorage.removeItem(this.storageKey);
        this._hideIndicator();
        console.log('[BackgroundAlert] Unsubscribed');
    },

    _showIndicator: function () {
        document.getElementById('bg-alert-indicator')?.classList.remove('hidden');
    },

    _hideIndicator: function () {
        document.getElementById('bg-alert-indicator')?.classList.add('hidden');
    }
};

// Expose internal controllers to global window for E2E testing
window.AppState = AppState;
window.MapController = MapController;
window.UIController = UIController;
window.BackgroundAlert = BackgroundAlert;
