const C = { grid: '#294033', text: '#7f9986', axis: '#3a5142', gradient: '#f58eac', update: '#c8f68a' };
function fit(canvas) { const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, r.width), h = Math.max(1, r.height); if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) {
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
} const ctx = canvas.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx, w, h }; }
function label(ctx, text, x, y, align = 'left', color = C.text) { ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y); }
function path(ctx, points, color, width = 1.5) { if (points.length < 2)
    return; ctx.beginPath(); for (let i = 0; i < points.length; i++)
    i ? ctx.lineTo(...points[i]) : ctx.moveTo(...points[i]); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
function arrow(ctx, x, y, dx, dy, color, max = 38) { const n = Math.hypot(dx, dy); if (n < 1e-12)
    return; let len = Math.min(max, 10 + Math.log1p(n) * 10); dx = dx / n * len; dy = dy / n * len; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke(); const a = Math.atan2(dy, dx); ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - 5 * Math.cos(a - .5), y + dy - 5 * Math.sin(a - .5)); ctx.lineTo(x + dx - 5 * Math.cos(a + .5), y + dy - 5 * Math.sin(a + .5)); ctx.closePath(); ctx.fill(); }
export function formatNumber(n, d = 4) { if (!Number.isFinite(n))
    return '—'; if (n === 0)
    return '0'; const a = Math.abs(n); return a < .001 || a >= 10000 ? n.toExponential(2) : n.toFixed(d).replace(/\.?0+$/, ''); }
export class TerrainPlot {
    constructor(canvas) { this.canvas = canvas; this.cache = null; this.key = ''; this.box = { x: 40, y: 12, s: 300 }; }
    prepare(terrain, def) {
        let key = JSON.stringify(def);
        if (this.key === key)
            return;
        this.key = key;
        const n = 136, b = terrain.bounds, span = b[1] - b[0], values = [], finite = [];
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                let v;
                try {
                    v = terrain.value([b[0] + i / (n - 1) * span, b[1] - j / (n - 1) * span]);
                }
                catch {
                    v = NaN;
                }
                values.push(v);
                if (Number.isFinite(v))
                    finite.push(v);
            }
        }
        finite.sort((a, b) => a - b);
        const levels = [];
        for (let i = 1; i < 18; i++)
            levels.push(finite[Math.min(finite.length - 1, Math.floor(finite.length * (i / 19) ** 1.8))]);
        const lo = finite[0] || 0, hi = finite[Math.floor(finite.length * .97)] || lo + 1;
        const surface = document.createElement('canvas');
        surface.width = n;
        surface.height = n;
        const ctx = surface.getContext('2d'), img = ctx.createImageData(n, n);
        for (let i = 0; i < values.length; i++) {
            let t = Math.max(0, Math.min(1, (values[i] - lo) / (hi - lo || 1)));
            t = Math.pow(t, .42);
            let col = Number.isFinite(t) ? [18 + 31 * t, 32 + 51 * t, 27 + 19 * t] : [35, 26, 32];
            img.data[i * 4] = col[0];
            img.data[i * 4 + 1] = col[1];
            img.data[i * 4 + 2] = col[2];
            img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const contour = [];
        for (const level of levels) {
            let segments = [];
            for (let j = 0; j < n - 1; j++)
                for (let i = 0; i < n - 1; i++) {
                    const vs = [values[j * n + i], values[j * n + i + 1], values[(j + 1) * n + i + 1], values[(j + 1) * n + i]], ps = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], hits = [];
                    for (let e = 0; e < 4; e++) {
                        let a = vs[e], b2 = vs[(e + 1) % 4];
                        if (!Number.isFinite(a) || !Number.isFinite(b2))
                            continue;
                        if ((a <= level && b2 > level) || (a > level && b2 <= level)) {
                            let f = (level - a) / (b2 - a);
                            hits.push([ps[e][0] + f * (ps[(e + 1) % 4][0] - ps[e][0]), ps[e][1] + f * (ps[(e + 1) % 4][1] - ps[e][1])]);
                        }
                    }
                    for (let k = 0; k + 1 < hits.length; k += 2)
                        segments.push([hits[k], hits[k + 1]]);
                }
            contour.push(segments);
        }
        this.cache = { surface, n, contour, lo, hi };
    }
    coordinate(clientX, clientY, bounds) { const r = this.canvas.getBoundingClientRect(), q = this.box; const px = clientX - r.left, py = clientY - r.top; if (px < q.x || px > q.x + q.s || py < q.y || py > q.y + q.s)
        return null; return [bounds[0] + (px - q.x) / q.s * (bounds[1] - bounds[0]), bounds[1] - (py - q.y) / q.s * (bounds[1] - bounds[0])]; }
    draw(terrain, def, start, runs = [], step = 0, focus = 0, field = false, previousHistory = null, inspectAll = false) {
        this.prepare(terrain, def);
        const { ctx, w, h } = fit(this.canvas);
        const s = Math.max(80, Math.min(w - 72, h - 44)), x = (w - s) / 2, y = 10;
        this.box = { x, y, s };
        const b = terrain.bounds, span = b[1] - b[0], coord = p => [x + (p[0] - b[0]) / span * s, y + (b[1] - p[1]) / span * s];
        const cache = this.cache;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, s, s);
        ctx.clip();
        ctx.drawImage(cache.surface, x, y, s, s);
        ctx.strokeStyle = '#526a424f';
        ctx.lineWidth = .75;
        for (let k = 0; k < cache.contour.length; k++) {
            ctx.beginPath();
            for (const [p, q] of cache.contour[k]) {
                ctx.moveTo(x + p[0] / (cache.n - 1) * s, y + p[1] / (cache.n - 1) * s);
                ctx.lineTo(x + q[0] / (cache.n - 1) * s, y + q[1] / (cache.n - 1) * s);
            }
            ctx.stroke();
        }
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = '#91b58c23';
        for (let i = 0; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * s / 4, y);
            ctx.lineTo(x + i * s / 4, y + s);
            ctx.moveTo(x, y + i * s / 4);
            ctx.lineTo(x + s, y + i * s / 4);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        if (field) {
            for (let i = 1; i < 10; i++)
                for (let j = 1; j < 10; j++) {
                    const p = [b[0] + i / 10 * span, b[0] + j / 10 * span];
                    try {
                        let g = terrain.gradient(p), c = coord(p);
                        arrow(ctx, ...c, -g[0], g[1], '#c2d2b04d', 12);
                    }
                    catch { }
                }
        }
        if (!terrain.custom)
            for (const min of terrain.minima) {
                const c = coord(min);
                ctx.strokeStyle = '#cee9af';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(...c, 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = '#cbe6aa50';
                ctx.beginPath();
                ctx.arc(...c, 11, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#d7f7b8';
                ctx.fillRect(c[0] - 1, c[1] - 1, 2, 2);
            }
        // Optional comparison is an ephemeral display overlay, not a benchmark candidate.
        if (previousHistory?.length) {
            const previousPoints = previousHistory.slice(0, Math.min(step, previousHistory.length - 1) + 1).map(h => coord(h.point));
            ctx.save();
            ctx.setLineDash([5, 5]);
            path(ctx, previousPoints, '#f1c48c', 2);
            ctx.restore();
        }
        // In inspection mode, show the entire recorded path as a quiet guide for hit testing.
        if (inspectAll) runs.forEach(run => {
            const rows = run?.result?.history || [];
            ctx.save(); ctx.globalAlpha = .25; ctx.setLineDash([2, 5]);
            path(ctx, rows.map(h => coord(h.point)), run.color, 1.1);
            ctx.restore();
        });
        runs.forEach((run, idx) => {
            let hist = run.result.history;
            if (!hist.length)
                return;
            const end = Math.min(step, hist.length - 1), pts = hist.slice(0, end + 1).map(h => coord(h.point));
            ctx.globalAlpha = idx === focus ? 1 : .72;
            path(ctx, pts, run.color, idx === focus ? 2.3 : 1.6);
            const row = hist[end], c = coord(row.point);
            if (row.population?.length) {
                ctx.fillStyle = run.color + '55';
                for (const p of row.population) {
                    const cp = coord(p);
                    ctx.beginPath();
                    ctx.arc(...cp, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            if (idx === focus) {
                ctx.globalAlpha = 1;
                const prev = hist[Math.max(0, end - 1)], before = coord(prev.point);
                arrow(ctx, ...before, -row.gradient[0], row.gradient[1], C.gradient);
                arrow(ctx, ...before, row.update[0], -row.update[1], C.update);
                ctx.fillStyle = run.color + '24';
                ctx.beginPath();
                ctx.arc(...c, 10, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = run.color;
            ctx.strokeStyle = '#15251a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(...c, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
        const st = coord(start);
        ctx.strokeStyle = '#ecf5e6';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(...st, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = '#4c6445';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, s, s);
        for (let i = 0; i <= 4; i++) {
            label(ctx, formatNumber(b[0] + span * i / 4, 1), x + s * i / 4, y + s + 16, 'center');
            label(ctx, formatNumber(b[1] - span * i / 4, 1), x - 10, y + s * i / 4 + 3, 'right');
        }
        label(ctx, 'x', x + s + 15, y + s + 16, 'left', '#c0d1ad');
        label(ctx, 'y', x - 12, y - 2, 'center', '#c0d1ad');
    }
}
export function drawLoss(canvas, runs, step, focus = 0, xkey = 't', previousHistory = null) {
    const { ctx, w, h } = fit(canvas);
    const pad = { l: 45, r: 18, t: 12, b: 26 }, cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    ctx.strokeStyle = '#354d3d55';
    ctx.lineWidth = 1;
    const all = [...runs.flatMap(r => r.result.history), ...(previousHistory || [])];
    if (!all.length) {
        for (let i = 0; i < 3; i++) {
            let y = pad.t + i * ch / 2;
            path(ctx, [[pad.l, y], [w - pad.r, y]], '#314b3a65', .8);
        }
        label(ctx, '実行すると損失の推移が表示されます', w / 2, h / 2, 'center', '#6d8875');
        return;
    }
    const signed = all.some(v => v.loss < 0), trans = v => signed ? Math.sign(v) * Math.log10(1 + Math.abs(v)) : Math.log10(Math.max(1e-9, v));
    let lo = Math.min(...all.map(v => trans(v.loss))), hi = Math.max(...all.map(v => trans(v.loss)));
    if (hi - lo < .1) {
        hi += .5;
        lo -= .5;
    }
    let xmax = Math.max(1, ...all.map(v => v[xkey]));
    const co = row => [pad.l + row[xkey] / xmax * cw, pad.t + (hi - trans(row.loss)) / (hi - lo) * ch];
    for (let i = 0; i <= 3; i++) {
        const y = pad.t + ch * i / 3;
        path(ctx, [[pad.l, y], [w - pad.r, y]], '#344f3c55', .8);
        let v = hi - (hi - lo) * i / 3;
        label(ctx, signed ? formatNumber(Math.sign(v) * (10 ** Math.abs(v) - 1), 1) : 10 ** v >= .01 ? formatNumber(10 ** v, 2) : (10 ** v).toExponential(0), pad.l - 8, y + 3, 'right');
        label(ctx, String(Math.round(xmax * i / 3)), pad.l + cw * i / 3, h - 7, 'center');
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, cw, ch);
    ctx.clip();
    if (previousHistory?.length) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        path(ctx, previousHistory.map(co), '#f1c48c', 1.8);
        ctx.restore();
    }
    runs.forEach((r, i) => { ctx.globalAlpha = i === focus ? 1 : .6; path(ctx, r.result.history.map(co), r.color, i === focus ? 1.8 : 1.3); });
    ctx.globalAlpha = 1;
    const r = runs[focus];
    if (r?.result.history.length) {
        let row = r.result.history[Math.min(step, r.result.history.length - 1)], c = co(row);
        ctx.setLineDash([3, 3]);
        path(ctx, [[c[0], pad.t], [c[0], h - pad.b]], '#accb9b88', 1);
        ctx.setLineDash([]);
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(...c, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    label(ctx, signed ? 'symlog' : 'log', 8, 11, 'left', '#627a69');
}
export function drawSignal(canvas, run, step, axis = 0) { const { ctx, w, h } = fit(canvas), pad = { l: 5, r: 6, t: 10, b: 18 }, cw = w - 11, ch = h - 28; const hist = run?.result.history; if (!hist?.length) {
    path(ctx, [[5, h / 2], [w - 6, h / 2]], '#3b514155', .8);
    label(ctx, 'g → 履歴 → 更新', w / 2, h / 2 - 10, 'center', '#6d8875');
    return;
} const series = [{ fn: r => r.gradient[axis], color: '#f58eac' }, { fn: r => r.metrics['m' + axis], color: '#f1bd72' }, { fn: r => r.update[axis], color: '#72d9a2' }]; let values = hist.flatMap(r => series.map(s => s.fn(r)).filter(Number.isFinite)); const max = Math.max(1e-8, ...values.map(Math.abs)); const y = v => pad.t + ch / 2 - v / max * ch * .45; path(ctx, [[pad.l, y(0)], [w - pad.r, y(0)]], '#50694d80', .8); for (const s of series) {
    const pts = hist.map((r, i) => { let v = s.fn(r); return Number.isFinite(v) ? [pad.l + i / Math.max(1, hist.length - 1) * cw, y(v)] : null; }).filter(Boolean);
    path(ctx, pts, s.color, 1.2);
} let x = pad.l + Math.min(step, hist.length - 1) / Math.max(1, hist.length - 1) * cw; ctx.setLineDash([2, 3]); path(ctx, [[x, pad.t], [x, h - pad.b]], '#bedaa788', 1); ctx.setLineDash([]); label(ctx, '0', pad.l, h - 3); label(ctx, String(hist.length - 1), w - pad.r, h - 3, 'right'); }
