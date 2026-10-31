import { mkdir, writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export class PostStore {
    constructor(directory, { maxPosts = 1000, ttlDays = 30 } = {}) { this.directory = directory; this.maxPosts = maxPosts; this.ttlMs = ttlDays * 86400000; this.lock = Promise.resolve(); }
    file(id) { if (!/^[a-f0-9]{32}$/.test(id))
        throw Object.assign(new Error('投稿が見つかりません。'), { status: 404 }); return path.join(this.directory, id + '.json'); }
    async create(payload) {
        // Serialize capacity check + insert within this single Node process.
        let release;
        const before = this.lock;
        this.lock = new Promise(r => { release = r; });
        await before;
        try {
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            const names = (await readdir(this.directory)).filter(n => /^[a-f0-9]{32}\.json$/.test(n));
            for (const name of names) {
                try {
                    const p = JSON.parse(await readFile(path.join(this.directory, name), 'utf8'));
                    if (p.expiresAt < Date.now())
                        await unlink(path.join(this.directory, name));
                }
                catch { }
            }
            if ((await readdir(this.directory)).filter(n => n.endsWith('.json')).length >= this.maxPosts)
                throw Object.assign(new Error('公開投稿の保存上限です。管理者に連絡してください。'), { status: 503 });
            const id = randomBytes(16).toString('hex'), deleteKey = randomBytes(32).toString('base64url'), createdAt = Date.now(), expiresAt = createdAt + this.ttlMs;
            const revision = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
            await writeFile(this.file(id), JSON.stringify({ id, createdAt, expiresAt, revision, deleteHash: createHash('sha256').update(deleteKey).digest('hex'), ...payload }), { flag: 'wx', mode: 0o600 });
            return { id, deleteKey, createdAt, expiresAt, revision };
        }
        finally {
            release();
        }
    }
    async raw(id) { try {
        const p = JSON.parse(await readFile(this.file(id), 'utf8'));
        if (p.expiresAt < Date.now()) {
            await unlink(this.file(id));
            throw Object.assign(new Error('投稿の保存期間が終了しました。'), { status: 404 });
        }
        return p;
    }
    catch (e) {
        if (e.code === 'ENOENT')
            throw Object.assign(new Error('投稿が見つかりません。'), { status: 404 });
        throw e;
    } }
    async get(id) { const { deleteHash, ...publicPost } = await this.raw(id); return publicPost; }
    async remove(id, key) { if (typeof key !== 'string' || key.length > 128)
        throw Object.assign(new Error('削除キーが一致しません。'), { status: 403 }); const p = await this.raw(id); const actual = createHash('sha256').update(key).digest(); const expected = Buffer.from(p.deleteHash, 'hex'); if (!timingSafeEqual(actual, expected))
        throw Object.assign(new Error('削除キーが一致しません。'), { status: 403 }); await unlink(this.file(id)); }
}
