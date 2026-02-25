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
        this.map = L.map('map', { zoomControl: false }).setView([lat, lng], 14);
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

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
            const marker = L.marker([car.lat, car.lng], { icon: carIcon, plate: car.plate }).addTo(this.map);
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
