import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PostStore } from './store.mjs';
import { validatePost } from '../src/core/schema.js';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };
function readJson(req) { return new Promise((resolve, reject) => { let n = 0, chunks = [], rejected = false; req.on('data', c => { n += c.length; if (n > 1048576) {
    if (!rejected) {
        rejected = true;
        chunks = [];
        reject(Object.assign(new Error('投稿は1MiB以内です。'), { status: 413 }));
    }
}
else if (!rejected)
    chunks.push(c); }); req.on('end', () => { if (rejected)
    return; try {
    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
catch {
    reject(Object.assign(new Error('JSONを解釈できません。'), { status: 400 }));
} }); req.on('error', reject); }); }
export function createServer({ dataDir = path.resolve('data'), publicDir = path.resolve('dist'), postLimit = 10, maxPosts = 1000, ttlDays = 30, publicOrigin = '' } = {}) {
    const store = new PostStore(dataDir, { maxPosts, ttlDays }), limits = new Map();
    publicDir = path.resolve(publicDir);
    function limited(req, type, max, windowMs) { const key = (req.socket.remoteAddress || 'local') + ':' + type, now = Date.now(); let v = limits.get(key); if (!v || now - v.start >= windowMs) {
        v = { start: now, count: 0 };
        limits.set(key, v);
    } if (++v.count > max)
        throw Object.assign(new Error('操作回数の上限です。時間をおいてください。'), { status: 429 }); if (limits.size > 10000)
        for (const [k, val] of limits)
            if (now - val.start > 3600000)
                limits.delete(k); }
    return http.createServer(async (req, res) => {
        res.setHeader('Content-Security-Policy', CSP);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(data === undefined ? '' : JSON.stringify(data)); };
        try {
            const url = new URL(req.url, 'http://localhost');
            if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.headers.origin) {
                const origin = req.headers.origin, expected = publicOrigin || `http://${req.headers.host}`;
                const tlsOrigin = `https://${req.headers.host}`;
                if (origin !== expected && (publicOrigin || origin !== tlsOrigin))
                    return send(403, { error: '別オリジンからの変更要求は禁止です。' });
            }
            if (url.pathname === '/api/status' && req.method === 'GET')
                return send(200, { sharing: true, version: '0.3.0', ttlDays, maxPayloadBytes: 1048576 });
            if (url.pathname === '/api/posts' && req.method === 'POST') {
                limited(req, 'post', postLimit, 3600000);
                if (!req.headers['content-type']?.startsWith('application/json'))
                    return send(415, { error: 'application/json が必要です。' });
                if (Number(req.headers['content-length']) > 1048576) {
                    req.resume();
                    return send(413, { error: '投稿は1MiB以内です。' });
                }
                let body = await readJson(req);
                let p;
                try {
                    p = validatePost(body);
                }
                catch (e) {
                    return send(400, { error: e.message });
                }
                return send(201, await store.create(p));
            }
            const match = /^\/api\/posts\/([a-f0-9]{32})$/.exec(url.pathname);
            if (match) {
                if (req.method === 'GET') {
                    limited(req, 'read', 240, 60000);
                    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
                    return send(200, await store.get(match[1]));
                }
                if (req.method === 'DELETE') {
                    limited(req, 'delete', 30, 3600000);
                    await store.remove(match[1], req.headers['x-delete-key']);
                    return send(204);
                }
                return send(405, { error: 'この操作は対応していません。' });
            }
            if (url.pathname.startsWith('/api/'))
                return send(404, { error: 'APIが見つかりません。' });
            if (!['GET', 'HEAD'].includes(req.method))
                return send(405, { error: '対応していない操作です。' });
            let pathname;
            try {
                pathname = decodeURIComponent(url.pathname);
            }
            catch {
                return send(400, { error: 'URLが不正です。' });
            }
            if (pathname.split('/').some(p => p.startsWith('.')))
                return send(404, { error: 'ページが見つかりません。' });
            if (pathname === '/')
                pathname = '/index.html';
            const target = path.resolve(publicDir, '.' + pathname);
            if (!target.startsWith(publicDir + path.sep))
                return send(404, { error: 'ページが見つかりません。' });
            try {
                if (!(await stat(target)).isFile())
                    return send(404, { error: 'ページが見つかりません。' });
                let b = await readFile(target);
                res.statusCode = 200;
                res.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Content-Length', b.length);
                res.end(req.method === 'HEAD' ? undefined : b);
            }
            catch (e) {
                if (e.code === 'ENOENT')
                    return send(404, { error: 'ページが見つかりません。' });
                throw e;
            }
        }
        catch (e) {
            if (!res.headersSent)
                send(e.status || 500, { error: e.status ? e.message : 'サーバーで処理できませんでした。' });
            else
                res.end();
        }
    });
}
