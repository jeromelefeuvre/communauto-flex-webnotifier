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
    });
});
