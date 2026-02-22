import http from 'http';
import fs from 'fs';
import path from 'path';
import https from 'https';

const PORT = 8000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    // Enable CORS for all routes (just in case)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    // Route handling
    if (req.url.startsWith('/api/cars')) {
        return handleApiProxy(req, res);
    }

    if (req.url.startsWith('/proxy-image')) {
        return handleImageProxy(req, res);
    }

    return handleStaticFiles(req, res);
});

function handleApiProxy(req, res) {
    const targetUrl = new URL(req.url.replace('/api/cars', '/WCF/LSI/LSIBookingServiceV3.svc/GetAvailableVehicles'), 'https://www.reservauto.net');
    console.log(`[API] Proxying request to: ${targetUrl.href}`);

    https.get(targetUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('[API] Proxy Error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    });
}

function handleImageProxy(req, res) {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const imgUrl = urlParams.get('url');

    if (!imgUrl) {
        res.writeHead(400);
        return res.end('Missing url parameter');
    }

    console.log(`[IMG] Proxying image request to: ${imgUrl}`);
    const protocol = imgUrl.startsWith('https') ? https : http;

    protocol.get(imgUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'image/png',
            'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('[IMG] Image Proxy Error:', err);
        res.writeHead(500);
        res.end('Error fetching image');
    });
}

function handleStaticFiles(req, res) {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

server.listen(PORT, () => {
    console.log(`[🚀] Car Notify Web App running at http://localhost:${PORT}`);
});
