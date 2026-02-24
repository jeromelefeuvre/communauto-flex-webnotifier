const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    outputDir: './report/test-results',
    fullyParallel: true,
    retries: 0,
    workers: 1,
    reporter: [
        ['list'],
        ['monocart-reporter', {
            name: "My Test Coverage Report",
            outputFile: './report/report.html',
            coverage: {
                sourceFilter: (sourcePath) => sourcePath.includes('app.js'),
                reports: ['console-summary']
            }
        }]
    ],
    use: {
        baseURL: 'http://localhost:8000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        }
    ],
    webServer: {
        command: 'node backend/server.mjs',
        url: 'http://localhost:8000',
        reuseExistingServer: !process.env.CI,
    },
});
