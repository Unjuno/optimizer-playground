import { createServer } from './app.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = createServer({ publicDir: path.join(root, 'dist'), dataDir: process.env.DATA_DIR || path.join(root, 'data'), maxPosts: Number(process.env.MAX_POSTS || 1000), ttlDays: Number(process.env.POST_TTL_DAYS || 30), publicOrigin: process.env.PUBLIC_ORIGIN || '' });
server.listen(port, host, () => console.log(`Optimizer Playground: http://${host}:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => server.close(() => process.exit(0)));
