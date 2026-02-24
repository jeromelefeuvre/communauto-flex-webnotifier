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
        mapWrapper: document.getElementById('map-wrapper'),
        formInputs: document.getElementById('form-inputs'),
        btnModifySearch: document.getElementById('btn-modify-search')
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

    showSuccessCars: function (cars, city) {
        // Collapse the search inputs to save vertical screen space
        this.els.formInputs.classList.add('hidden');
        this.els.btnModifySearch.classList.remove('hidden');

        const bookingUrl = getBookingUrl(city);

        let html = '';
        cars.forEach((car, index) => {
            html += `
                <div class="car-card" data-plate="${car.plate}" data-lat="${car.lat}" data-lng="${car.lng}">
                    <div class="car-info">
                        <h3>${car.brand} ${car.model}</h3>
                        <p id="desc-${car.plate}" class="car-card-desc">${Math.floor(car.distance)}m away (straight line) • Plate: ${car.plate} • ${car.color}</p>
                    </div>
                    <a href="${bookingUrl}" target="_blank" class="book-btn" onclick="event.stopPropagation()">Reserve</a>
                </div>
            `;
        });

        this.els.resultsContainer.innerHTML = html;

        // Attach click listeners to cards for map routing
        const cards = this.els.resultsContainer.querySelectorAll('.car-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                // Remove selected class from all
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');

                const lat = parseFloat(card.dataset.lat);
                const lng = parseFloat(card.dataset.lng);
                const plate = card.dataset.plate;

                const car = cars.find(c => c.plate === plate);

                MapController.drawRouteToCar(AppState.userLocation[0], AppState.userLocation[1], lat, lng).then(routeData => {
                    if (routeData) {
                        this.updateCarUIWithWalkingData(car, MathUtils.humanDistance(routeData.distance), Math.round(routeData.duration / 60));
                    }
                });

                // Also open the popup on the map for the associated marker
                const marker = MapController.carMarkers.find(m => m.options.plate === plate);
                if (marker) {
                    marker.openPopup();
                }
            });
        });
    },

    updateCarUIWithWalkingData: function (car, walkDistanceStr, walkMins) {
        const cardDesc = document.getElementById(`desc-${car.plate}`);
        if (cardDesc) {
            cardDesc.innerText = `${walkDistanceStr} walking (${walkMins} min) • Plate: ${car.plate} • ${car.color}`;
        }
    },

    expandForm: function () {
        this.els.formInputs.classList.remove('hidden');
        this.els.btnModifySearch.classList.add('hidden');
        this.els.resultsContainer.innerHTML = ''; // Optionally clear results when modifying
        MapController.clearRoutes(); // Optionally clear map routes when modifying
        MapController.carMarkers.forEach(m => MapController.map.removeLayer(m));
        MapController.carMarkers = [];
    }
};
