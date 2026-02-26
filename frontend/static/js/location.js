// Location Controller
// Manages the GPS button state and the Nominatim address autocomplete fallback.
// Depends on: UIController (ui.js), AppState (app.js)
const LocationController = {
    _debounceTimer: null,
    _activeIndex: -1,

    // Call on page load: probe GPS permission silently, update button state.
    init: function () {
        if (navigator.permissions && navigator.geolocation) {
            navigator.permissions.query({ name: 'geolocation' }).then(result => {
                if (result.state === 'granted') {
                    this.setLoading();
                    navigator.geolocation.getCurrentPosition(
                        pos => this.onGpsSuccess(pos, true /* autoStart */),
                        () => this.onGpsError()
                    );
                } else if (result.state === 'denied') {
                    this.onGpsError();
                } else {
                    // 'prompt' — wait for the user to click the button
                    this.setIdle();
                }
            });
        } else {
            this.onGpsError();
        }

        // Wire up the address autocomplete
        UIController.els.addressInput.addEventListener('input', () => this.onAddressInput());
        UIController.els.addressInput.addEventListener('keydown', e => this.onAddressKeydown(e));
        document.addEventListener('click', e => {
            if (!UIController.els.addressWrapper.contains(e.target)) {
                this.hideSuggestions();
            }
        });
    },

    setIdle: function () {
        const btn = UIController.els.btnGeo;
        btn.className = 'geo-btn';

        this.hideAddressInput();
    },

    setLoading: function () {
        const btn = UIController.els.btnGeo;
        btn.className = 'geo-btn';

    },

    onGpsSuccess: function (position, autoStart = false) {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        UIController.els.locationInput.value = `${lat},${lng}`;
        // AppState may not exist yet during init, use a safe accessor:
        if (typeof AppState !== 'undefined') {
            AppState.userLocation = [parseFloat(lat), parseFloat(lng)];
        }
        UIController.els.btnGeo.className = 'geo-btn geo-success';

        this.hideAddressInput();
        if (autoStart) {
            UIController.els.btnStart.click();
        }
    },

    onGpsError: function () {
        UIController.els.locationInput.value = '';
        UIController.els.btnGeo.className = 'geo-btn geo-error';

        this.showAddressInput();
    },

    showAddressInput: function () {
        UIController.els.addressWrapper.classList.remove('hidden');
        UIController.els.addressInput.focus();
    },

    hideAddressInput: function () {
        UIController.els.addressWrapper.classList.add('hidden');
        this.hideSuggestions();
    },

    // ── Autocomplete ──────────────────────────────────────────────────────────

    onAddressInput: function () {
        clearTimeout(this._debounceTimer);
        const query = UIController.els.addressInput.value.trim();
        if (query.length === 0) {
            // Field cleared — revert to error state so user knows no location is set
            UIController.els.btnGeo.className = 'geo-btn geo-error';
    
            UIController.els.locationInput.value = '';
            if (typeof AppState !== 'undefined') AppState.userLocation = null;
            this.hideSuggestions();
            return;
        }
        if (query.length < 3) { this.hideSuggestions(); return; }
        this._debounceTimer = setTimeout(() => this.fetchSuggestions(query), 350);
    },

    // Detect and normalize Canadian postal codes (e.g. "h2m1r4" → "H2M 1R4")
    _parsePostalCode: function (query) {
        const match = query.match(/^([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)$/);
        if (!match) return null;
        return `${match[1]} ${match[2]}`.toUpperCase();
    },

    // Build a French-Quebec equivalent of an English address query.
    // e.g. "9128 Berri Street Montreal" → "9128 rue Berri Montreal"
    _toFrenchQuery: function (query) {
        // English → French street type map (Quebec conventions)
        const types = {
            '\\bstreet\\b': 'rue', '\\bst\\.?\\b': 'rue',
            '\\bavenue\\b': 'avenue', '\\bave\\.?\\b': 'avenue',
            '\\bboulevard\\b': 'boulevard', '\\bblvd\\.?\\b': 'boulevard',
            '\\broad\\b': 'chemin', '\\brd\\.?\\b': 'chemin',
            '\\bdrive\\b': 'montée', '\\bdr\\.?\\b': 'montée',
            '\\bcourt\\b': 'cour', '\\bct\\.?\\b': 'cour',
            '\\blane\\b': 'ruelle', '\\bln\\.?\\b': 'ruelle',
            '\\bplace\\b': 'place', '\\bpl\\.?\\b': 'place',
            '\\bway\\b': 'voie',
        };
        let q = query;
        for (const [pattern, fr] of Object.entries(types)) {
            const re = new RegExp(pattern, 'gi');
            if (re.test(q)) {
                // Replace the English type and try to reorder:
                // "9128 Berri street Montreal" → "9128 rue Berri Montreal"
                q = q.replace(new RegExp(`(\\d+)\\s+(\\w+)\\s+${pattern}`, 'gi'),
                    `$1 ${fr} $2`);
                q = q.replace(new RegExp(pattern, 'gi'), fr);
                break;
            }
        }
        return q === query ? null : q; // null = no change, skip second request
    },

    fetchSuggestions: async function (query) {
        try {
            const headers = { 'Accept-Language': 'fr,en' };
            const city = UIController.els.city.selectedOptions[0].text;

            // Postal codes use geocoder.ca for precise neighborhood-level results
            const postalCode = this._parsePostalCode(query);
            if (postalCode) {
                const url = `https://geocoder.ca/?locate=${encodeURIComponent(postalCode)}&geoit=XML&json=1`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.latt && data.longt) {
                    const city_ = data.standard?.city || city;
                    const prov = data.standard?.prov || '';
                    this.renderSuggestions([{
                        display_name: `${postalCode}, ${city_}${prov ? ', ' + prov : ''}, Canada`,
                        lat: data.latt,
                        lon: data.longt
                    }]);
                } else {
                    this.hideSuggestions();
                }
                return;
            }

            // Append the selected city to improve results
            const queryWithCity = query.toLowerCase().includes(city.toLowerCase())
                ? query
                : `${query}, ${city}`;
            const buildUrl = q =>
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&countrycodes=ca`;

            const frQuery = this._toFrenchQuery(queryWithCity);
            const requests = [fetch(buildUrl(queryWithCity), { headers })];
            if (frQuery) requests.push(fetch(buildUrl(frQuery), { headers }));

            const responses = await Promise.all(requests);
            const arrays = await Promise.all(responses.map(r => r.json()));

            // Merge and deduplicate by rounded (lat, lon) key
            const seen = new Set();
            const results = [];
            for (const arr of arrays) {
                for (const r of arr) {
                    const key = `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lon).toFixed(4)}`;
                    if (!seen.has(key)) { seen.add(key); results.push(r); }
                }
            }

            this.renderSuggestions(results.slice(0, 5));
        } catch {
            this.hideSuggestions();
        }
    },

    renderSuggestions: function (results) {
        const list = UIController.els.addressSuggestions;
        list.innerHTML = '';
        this._activeIndex = -1;
        if (!results.length) { this.hideSuggestions(); return; }

        results.forEach((r) => {
            const li = document.createElement('li');
            li.textContent = r.display_name;
            li.dataset.lat = r.lat;
            li.dataset.lon = r.lon;
            li.addEventListener('mousedown', (e) => {
                e.preventDefault(); // keep focus on input
                this.selectSuggestion(li);
            });
            list.appendChild(li);
        });
        list.classList.remove('hidden');
    },

    selectSuggestion: function (li) {
        const lat = parseFloat(li.dataset.lat).toFixed(6);
        const lng = parseFloat(li.dataset.lon).toFixed(6);
        UIController.els.addressInput.value = li.textContent;
        UIController.els.locationInput.value = `${lat},${lng}`;
        if (typeof AppState !== 'undefined') {
            AppState.userLocation = [parseFloat(lat), parseFloat(lng)];
        }
        // Switch button from red error state to blue success — address is now set
        UIController.els.btnGeo.className = 'geo-btn geo-success';

        this.hideSuggestions();
    },

    hideSuggestions: function () {
        UIController.els.addressSuggestions.classList.add('hidden');
        UIController.els.addressSuggestions.innerHTML = '';
        this._activeIndex = -1;
    },

    onAddressKeydown: function (e) {
        const list = UIController.els.addressSuggestions;
        const items = list.querySelectorAll('li');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._activeIndex = Math.min(this._activeIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._activeIndex = Math.max(this._activeIndex - 1, 0);
        } else if (e.key === 'Enter' && this._activeIndex >= 0) {
            e.preventDefault();
            this.selectSuggestion(items[this._activeIndex]);
            return;
        } else if (e.key === 'Escape') {
            this.hideSuggestions();
            return;
        } else {
            return;
        }

        items.forEach((li, i) => li.classList.toggle('active', i === this._activeIndex));
        items[this._activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
};
