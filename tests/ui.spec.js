const { test, expect } = require('@playwright/test');
const { addCoverageReport } = require('monocart-reporter');

test.describe('UI Responsive Regression Tests', () => {

    test.beforeEach(async ({ page }) => {
        // Start collecting V8 Code Coverage
        await page.coverage.startJSCoverage({
            resetOnNavigation: false
        });

        // Intercept API calls to prevent live network dependencies
        await page.route('**/api/cars*', async route => {
            const mockData = { d: { Vehicles: [] } };
            await route.fulfill({ json: mockData });
        });

        // Do not mock geolocation so the app starts in a clean IDLE state 
        // with the search button visible and the form un-collapsed.
        await page.goto('http://localhost:8000');
    });

    test.afterEach(async ({ page }, testInfo) => {
        // Collect V8 Code Coverage
        const coverage = await page.coverage.stopJSCoverage();
        await addCoverageReport(coverage, testInfo);
    });

    test('Delay input field is permanently hidden', async ({ page }) => {
        // Ensure the delay field wrapper has the 'hidden' class applied
        const delayGroup = page.locator('.form-group').filter({ has: page.locator('#delay') });
        await expect(delayGroup).toHaveClass(/hidden/);
    });

    test.describe('Mobile Viewpoint (<480px)', () => {
        // Force the browser geometry to trigger mobile CSS media queries
        test.use({ viewport: { width: 400, height: 800 } });

        test('Search form correctly collapses into floating pill when searching', async ({ page }) => {
            // Initially, without auto-geolocation, the app starts idle.
            // Form is visible, pill is hidden.
            await expect(page.locator('#form-inputs')).toBeVisible();
            await expect(page.locator('.floating-search-bar')).toBeHidden();
            await expect(page.locator('#btn-start')).toBeVisible();

            // When searching begins, the form collapses into the floating pill
            await page.evaluate(() => {
                AppState.userLocation = [45.5017, -73.5673];
                document.getElementById('location').value = '45.5017,-73.5673';
            });
            await page.click('#btn-start');

            // Wait for UI to update its classes
            await expect(page.locator('#form-inputs')).toHaveClass(/hidden/);
            await expect(page.locator('.floating-search-bar')).not.toHaveClass(/hidden/);
            await expect(page.locator('.floating-search-bar')).toBeVisible();

            // The Stop button should be visible alongside the pill
            await expect(page.locator('#btn-stop')).toBeVisible();
        });
    });

    test.describe('Desktop Viewpoint (>900px)', () => {
        // Force the browser geometry to trigger desktop overrides
        test.use({ viewport: { width: 1200, height: 800 } });

        test('Search form remains expanded horizontally and ignores collapse logic', async ({ page }) => {
            // Initially on desktop, the full form should be visible natively
            await expect(page.locator('#form-inputs')).toBeVisible();
            await expect(page.locator('#btn-start')).toBeVisible();

            // Start search
            await page.evaluate(() => {
                AppState.userLocation = [45.5017, -73.5673];
                document.getElementById('location').value = '45.5017,-73.5673';
            });
            await page.click('#btn-start');

            // Wait for UI toggle (the HTML element gets the 'hidden' class from JS)
            await expect(page.locator('#form-inputs')).toHaveClass(/hidden/);

            // HOWEVER - because of the desktop CSS override we added, 
            // the form should STILL physically render inline flex
            const box = await page.locator('#form-inputs').boundingBox();
            expect(box).not.toBeNull();
            expect(box.width).toBeGreaterThan(0);

            // Furthermore, the floating search bar pill should be forcefully hidden by CSS
            // even if JS tries to remove its internal hidden class
            const pillBox = await page.locator('.floating-search-bar').boundingBox();
            expect(pillBox).toBeNull();

            // The Stop button should be visible natively inline with the form
            await expect(page.locator('#btn-stop')).toBeVisible();
            const stopBox = await page.locator('#btn-stop').boundingBox();
            expect(stopBox).not.toBeNull();
        });

        test('Results panel sits side-by-side with map at equal height', async ({ page }) => {
            // Override the empty mock with a single car that is within the 600m radius
            await page.route('**/api/cars*', async route => {
                await route.fulfill({
                    json: {
                        d: {
                            Vehicles: [{
                                CarBrand: 'Toyota', CarModel: 'Corolla', CarPlate: 'TST001',
                                CarColor: 'white', Latitude: 45.5020, Longitude: -73.5680
                            }]
                        }
                    }
                });
            });

            await page.evaluate(() => {
                AppState.userLocation = [45.5017, -73.5673];
                document.getElementById('location').value = '45.5017,-73.5673';
            });
            await page.click('#btn-start');

            // Wait for the car card to appear (search has completed and UI updated)
            await expect(page.locator('.car-card')).toBeVisible();

            const overlayBox = await page.locator('#results-overlay').boundingBox();
            const mapBox = await page.locator('#map').boundingBox();

            expect(overlayBox).not.toBeNull();
            expect(mapBox).not.toBeNull();

            // Panel must be to the RIGHT of the map (panel left edge >= map right edge)
            expect(overlayBox.x).toBeGreaterThanOrEqual(mapBox.x + mapBox.width - 1);

            // Both must share roughly the same top position (within 2px)
            expect(Math.abs(overlayBox.y - mapBox.y)).toBeLessThan(2);

            // Both must have meaningful equal height
            expect(overlayBox.height).toBeGreaterThan(100);
            expect(mapBox.height).toBeGreaterThan(100);
            expect(Math.abs(overlayBox.height - mapBox.height)).toBeLessThan(2);
        });
    });
});

test.describe('LocationController — Smart Location Widget', () => {

    test.beforeEach(async ({ page }) => {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
        await page.route('**/api/cars*', route => route.fulfill({ json: { d: { Vehicles: [] } } }));
    });

    test.afterEach(async ({ page }, testInfo) => {
        const coverage = await page.coverage.stopJSCoverage();
        await addCoverageReport(coverage, testInfo);
    });

    test('GPS success: button turns blue and address input stays hidden', async ({ page }) => {
        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: 45.5017, longitude: -73.5673 });
        await page.goto('http://localhost:8000');

        // Wait for LocationController to resolve GPS
        await expect(page.locator('#btn-geolocation')).toHaveClass(/geo-success/, { timeout: 5000 });

        // Label should confirm GPS found
        await expect(page.locator('#geo-label')).toHaveText('Location found');

        // Address input wrapper must remain hidden
        await expect(page.locator('#address-input-wrapper')).toBeHidden();

        // Hidden location field must hold the resolved coordinates
        const locValue = await page.evaluate(() => document.getElementById('location').value);
        expect(locValue).toMatch(/^45\.\d+,-73\.\d+$/);
    });

    test('GPS error: button turns red and address input becomes visible', async ({ page }) => {
        // No geolocation grant → permission stays 'denied'
        await page.goto('http://localhost:8000');

        // Simulate GPS failure (permission denied path in LocationController)
        await page.evaluate(() => LocationController.onGpsError());

        await expect(page.locator('#btn-geolocation')).toHaveClass(/geo-error/);
        await expect(page.locator('#geo-label')).toHaveText('No GPS — enter address');
        await expect(page.locator('#address-input-wrapper')).toBeVisible();
    });

    test('Address autocomplete: typing shows Nominatim suggestions', async ({ page }) => {
        await page.goto('http://localhost:8000');

        // Force the address input visible
        await page.evaluate(() => LocationController.onGpsError());

        // Mock the Nominatim API so we don't hit the network
        await page.route('**/nominatim.openstreetmap.org/**', route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify([
                { display_name: 'Montréal, Québec, Canada', lat: '45.5088', lon: '-73.5878' },
                { display_name: 'Montreal West, Québec, Canada', lat: '45.4514', lon: '-73.6441' }
            ])
        }));

        await page.fill('#address-input', 'Montr');

        // Suggestions dropdown should appear
        await expect(page.locator('#address-suggestions')).not.toHaveClass(/hidden/, { timeout: 2000 });
        const items = page.locator('#address-suggestions li');
        await expect(items).toHaveCount(2);
        await expect(items.first()).toContainText('Montréal');
    });

    test('Address autocomplete: selecting a suggestion sets location and hides dropdown', async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.evaluate(() => LocationController.onGpsError());

        await page.route('**/nominatim.openstreetmap.org/**', route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify([
                { display_name: 'Montréal, Québec, Canada', lat: '45.508800', lon: '-73.587800' }
            ])
        }));

        await page.fill('#address-input', 'Montr');
        await expect(page.locator('#address-suggestions li')).toBeVisible({ timeout: 2000 });

        // Click the first suggestion
        await page.locator('#address-suggestions li').first().click();

        // Dropdown should be hidden
        await expect(page.locator('#address-suggestions')).toHaveClass(/hidden/);

        // AppState.userLocation must be set to the geocoded coordinates
        const loc = await page.evaluate(() => AppState.userLocation);
        expect(loc[0]).toBeCloseTo(45.5088, 3);
        expect(loc[1]).toBeCloseTo(-73.5878, 3);

        // Hidden #location field should also be updated
        const hiddenVal = await page.evaluate(() => document.getElementById('location').value);
        expect(hiddenVal).toBe('45.508800,-73.587800');

        // GPS button must switch to success state — red error label is gone
        await expect(page.locator('#btn-geolocation')).toHaveClass(/geo-success/);
        await expect(page.locator('#geo-label')).toHaveText('Location found');
    });

    test('_toFrenchQuery: English street types are converted to French', async ({ page }) => {
        await page.goto('http://localhost:8000');

        const cases = await page.evaluate(() => ({
            berriStreet: LocationController._toFrenchQuery('9128 Berri Street Montreal'),
            berriAve: LocationController._toFrenchQuery('9128 Berri Ave Montreal'),
            rueBerri: LocationController._toFrenchQuery('9128 rue Berri Montreal'),  // already French
            blvdSt: LocationController._toFrenchQuery('999 Main Blvd Toronto'),
        }));

        // "Berri Street" → "rue Berri" (number type name order)
        expect(cases.berriStreet).toBe('9128 rue Berri Montreal');
        // Ave → avenue
        expect(cases.berriAve).toMatch(/avenue/i);
        // Already French — should return null (no change)
        expect(cases.rueBerri).toBeNull();
        // Blvd → boulevard
        expect(cases.blvdSt).toMatch(/boulevard/i);
    });

    test('Address autocomplete: English address fires two parallel Nominatim requests', async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.evaluate(() => LocationController.onGpsError());

        const capturedUrls = [];
        await page.route('**/nominatim.openstreetmap.org/**', route => {
            capturedUrls.push(route.request().url());
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify([
                    { display_name: '9128 Rue Berri, Montréal', lat: '45.558000', lon: '-73.602000' }
                ])
            });
        });

        await page.fill('#address-input', '9128 Berri Street Montreal');

        // Wait for suggestions to appear
        await expect(page.locator('#address-suggestions li')).toBeVisible({ timeout: 2000 });

        // Should have fired TWO requests: original + French-normalized
        expect(capturedUrls.length).toBe(2);
        expect(capturedUrls.some(u => u.includes('Berri+Street') || u.includes('Berri%20Street'))).toBe(true);
        expect(capturedUrls.some(u => u.includes('rue+Berri') || u.includes('rue%20Berri'))).toBe(true);
    });
});
