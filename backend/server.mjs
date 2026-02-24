import http from 'http';
import { handleApiProxy, handleVersionProxy, handleImageProxy, handleStaticFiles } from './handlers.mjs';

const PORT = process.env.PORT || 8000;

const server = http.createServer((req, res) => {
    // Enable CORS for all routes (just in case)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    // Support reverse proxies by stripping the configured base URL
    const baseUrl = process.env.BASE_URL || '';
    let requestUrl = req.url;

    if (baseUrl && requestUrl.startsWith(baseUrl)) {
        requestUrl = requestUrl.slice(baseUrl.length);
        if (requestUrl === '') requestUrl = '/';
    }

    // Route handling
    if (requestUrl.startsWith('/api/cars')) {
        return handleApiProxy(requestUrl, res);
    }

    if (requestUrl.startsWith('/api/version')) {
        return handleVersionProxy(res);
    }

    if (requestUrl.startsWith('/proxy-image')) {
        return handleImageProxy(requestUrl, res);
    }

    return handleStaticFiles(requestUrl, res);
});

server.listen(PORT, () => {
    console.log(`[🚀] Car Notify Web App running at http://localhost:${PORT}`);
});
