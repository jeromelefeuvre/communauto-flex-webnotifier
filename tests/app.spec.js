const { test, expect } = require('@playwright/test');
const { addCoverageReport } = require('monocart-reporter');

test.describe('Communauto Flex WebNotifier end-to-end tests', () => {

    test.beforeEach(async ({ page }) => {
        // Start collecting V8 Code Coverage
        await page.coverage.startJSCoverage({
            resetOnNavigation: false
        });

        // Auto-accept any alerts the app throws (e.g. Stop Search)
        page.on('dialog', dialog => dialog.accept());
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        // Intercept API calls to avoid spamming the live Communauto servers
        await page.route('**/api/cars*', async route => {
            const mockData = {
                d: {
                    Vehicles: [
                        {
                            CarBrand: "Mock",
                            CarModel: "Close Car 1",
                            CarPlate: "TEST 01",
                            CarColor: "Blue",
                            Latitude: 45.556000, // ~686m away (outside 600m limit, inside 800m map buffer)
                            Longitude: -73.652000
                        },
                        {
                            CarBrand: "Mock",
                            CarModel: "Close Car 2",
                            CarPlate: "TEST 03",
                            CarColor: "Silver",
                            Latitude: 45.556100, // ~697m away
                            Longitude: -73.652100
                        },
                        {
                            CarBrand: "Mock",
                            CarModel: "Close Car 3",
                            CarPlate: "TEST 04",
                            CarColor: "Black",
                            Latitude: 45.556200, // ~708m away
                            Longitude: -73.652200
                        },
                        {
                            CarBrand: "Mock",
                            CarModel: "Far Car",
                            CarPlate: "TEST 02",
                            CarColor: "Red",
                            Latitude: 45.580000, // ~3.3km away (inside 5km, outside 1km)
                            Longitude: -73.652279
                        }
                    ]
                }
            };

            await new Promise(r => setTimeout(r, 100)); // Micro-delay to allow 'Fetching' state to paint
            await route.fulfill({ json: mockData });
        });

        // Mock geolocation to Montreal
        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: 45.549831, longitude: -73.652279 });
        await page.goto('http://localhost:8000');
    });

    test.afterEach(async ({ page }, testInfo) => {
        // Collect V8 Code Coverage and attach for monocart-reporter
        const coverage = await page.coverage.stopJSCoverage();
        await addCoverageReport(coverage, testInfo);
    });

    test('UI Loads correctly', async ({ page }) => {
        await expect(page).toHaveTitle(/Communauto/);
        await expect(page.locator('h1')).toHaveText('Communauto Flex WebNotify');
        await expect(page.locator('#map')).toBeVisible();
    });

    test('Auto-geolocation on load works', async ({ page }) => {
        // Because permissions are granted in beforeEach, it should auto-fetch and start
        await expect(page.locator('#location')).toHaveValue('45.549831,-73.652279');
        await expect(page.locator('#btn-stop')).toBeVisible();
    });

    test('Start and Stop Search toggle works', async ({ page }) => {
        // Stop the auto-search
        await page.click('#btn-stop');
        await expect(page.locator('#status-container')).toBeHidden();

        // Start it again
        await page.click('#btn-start');
        await expect(page.locator('#status-container')).toBeVisible();
    });

    test('Map interacts and draws cars', async ({ page }) => {
        // Wait for the fetch cycle to complete and map to populate
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // Check if Leaflet drew the user marker and car markers
        const markers = page.locator('.leaflet-marker-icon');
        await expect(async () => {
            const count = await markers.count();
            expect(count).toBeGreaterThan(1);
        }).toPass({ timeout: 15000 }); // At least user + 1 car

        // Check if search circle was drawn
        const paths = page.locator('.leaflet-interactive');
        await expect(paths.first()).toBeVisible();
    });

    test('Map does not zoom out to whole world on first search', async ({ page }) => {
        // Wait for the fetch cycle to complete and map to populate on initial load
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // Check if map zoom is reasonable (not 0 or very small which means whole world)
        const initialZoom = await page.evaluate(() => {
            return window.MapController.map ? window.MapController.map.getZoom() : null;
        });

        // It should be zoomed in enough to comfortably see the city (typically >= 10 depending on radius)
        expect(initialZoom).toBeGreaterThanOrEqual(10);
    });

    test('Map circle radius dynamically updates and zooms to fit bounds on drag', async ({ page }) => {
        // Wait for the app to load and auto-search to start
        await expect(page.locator('#btn-stop')).toBeVisible();
        await page.click('#btn-stop');
        await page.waitForSelector('#btn-start', { state: 'visible' });

        // Record initial map zoom and center
        const initialZoom = await page.evaluate(() => window.MapController.map.getZoom());

        // Hard wait to allow Leaflet tile rendering engines to settle before abruptly resizing bounds
        await page.waitForTimeout(1500);

        // Sync Leaflet's internal metrics before changing bounds in a racing CI environment
        await page.evaluate(() => window.MapController.map.invalidateSize());

        // Change the radius input via simulated range drag to max bounds
        await page.evaluate(() => {
            const el = document.getElementById('distance');
            el.value = '2000'; // Huge radius to force a zoom-out
            el.dispatchEvent(new Event('input'));
        });

        // Check updated radius
        const updatedRadius = await page.evaluate(() => {
            return window.MapController.searchCircle ? window.MapController.searchCircle.getRadius() : null;
        });
        expect(updatedRadius).toBe(2000);

        // Use robust polling to allow Leaflet bounds animation tick to settle natively without flake
        await expect(async () => {
            const currentZoom = await page.evaluate(() => window.MapController.map.getZoom());
            expect(currentZoom).toBeLessThan(initialZoom);
        }).toPass({ timeout: 5000 });
    });

    test('UI Search radius remains unchanged when a car is found', async ({ page }) => {
        // Wait for the app to load and auto-search to start
        await expect(page.locator('#btn-stop')).toBeVisible();
        await page.click('#btn-stop');
        await expect(page.locator('#btn-start')).toBeVisible();
        await page.waitForTimeout(500); // Give app.js a tick to clear searchLoop timeouts

        // Expand the UI form to assert the preserved values (or to change them)
        // Note: btn-modify-search is only visible after a successful search, not after manual stop on fresh load.
        // Wait, on fresh load, no cars are found yet, so form is not actually collapsed.

        // Let's verify if the form is already expanded or we need to click.
        // Since we just stopped the initial auto-search, the form should already be visible.

        // We must expand the sleek UI to access the input

        // Change distance to 800m to include the car via simulated slider drag
        await page.evaluate(() => {
            const el = document.getElementById('distance');
            el.value = '800';
            el.dispatchEvent(new Event('input'));
        });
        await page.click('#btn-start');

        // The mock API returns 3 cars at ~680-710m away.
        // It should find the cars, show them all, and stop searching, but NOT shrink the radius.
        await expect(page.locator('.car-card')).toHaveCount(3, { timeout: 15000 });

        // Now cars are found, the form IS collapsed. We must click modify to read distance.

        // The visible value should remain 800
        const visibleValue = await page.evaluate(() => document.getElementById('distance').value);
        expect(parseInt(visibleValue)).toBe(800);

        // Map circle should remain 800
        const updatedRadius = await page.evaluate(() => {
            return window.MapController.searchCircle ? window.MapController.searchCircle.getRadius() : null;
        });
        expect(updatedRadius).toBe(800);

        // Ensure search has dynamically stopped (Start button is visible again)
        await expect(page.locator('#btn-start')).toBeVisible();
    });
    test('Clicking a car card updates the map route and selection state', async ({ page }) => {
        // Wait for the app to load and auto-search to start
        await expect(page.locator('#btn-stop')).toBeVisible();
        await page.click('#btn-stop');
        await expect(page.locator('#btn-start')).toBeVisible();
        await page.waitForTimeout(500); // Give app.js a tick to clear searchLoop timeouts

        // Change distance to 800m to include the cars via simulated slider drag
        await page.evaluate(() => {
            const el = document.getElementById('distance');
            el.value = '800';
            el.dispatchEvent(new Event('input'));
        });
        await page.click('#btn-start');

        // Wait for cars to render
        await expect(page.locator('.car-card')).toHaveCount(3, { timeout: 15000 });

        const firstCar = page.locator('.car-card').nth(0);
        const secondCar = page.locator('.car-card').nth(1);

        // Verify initial selection state (first car is auto-selected)
        await expect(firstCar).toHaveClass(/selected/);
        await expect(secondCar).not.toHaveClass(/selected/);

        // Record the initial routed coordinate
        const initialRoutedCoord = await page.evaluate(() => window.MapController.lastRoutedCoord);
        expect(initialRoutedCoord).toBe('45.556,-73.652'); // Latitude: 45.556000, Longitude: -73.652000

        // Click the second car
        await secondCar.click();

        // Verify the selection state moved
        await expect(firstCar).not.toHaveClass(/selected/);
        await expect(secondCar).toHaveClass(/selected/);

        // Verify that the route was drawn to the new car's coordinates
        await expect(async () => {
            const activeRouteCoords = await page.evaluate(() => window.MapController.lastRoutedCoord);
            expect(activeRouteCoords).toBe('45.5561,-73.6521'); // Latitude: 45.556100, Longitude: -73.652100
        }).toPass({ timeout: 5000 });
    });

});
