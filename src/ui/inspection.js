/** Screen-space hit test for any recorded optimizer trajectory.
 * Points are allowed to overlap; ties prefer the currently inspected optimizer.
 * Canvas coordinates and the plot box are in CSS pixels (not device pixels).
 */
export function nearestTrajectoryStep({ runs, bounds, box, x, y, focused = 0, radius = 18 }) {
    if (!Array.isArray(runs) || !Array.isArray(bounds) || bounds.length !== 2 ||
        !Number.isFinite(bounds[0]) || !Number.isFinite(bounds[1]) || bounds[1] <= bounds[0] ||
        !box || !Number.isFinite(box.s) || box.s <= 0 || !Number.isFinite(x) || !Number.isFinite(y) ||
        !(radius > 0)) return null;
    if (x < box.x || y < box.y || x > box.x + box.s || y > box.y + box.s) return null;
    const span = bounds[1] - bounds[0];
    let best = null;
    let bestDistance = radius * radius;
    const consider = (runIndex, step, distance) => {
        const tie = best && Math.abs(distance - bestDistance) < 1e-8 &&
            runIndex === focused && best.runIndex !== focused;
        if (distance < bestDistance - 1e-8 || tie || (best === null && distance <= bestDistance)) {
            best = { runIndex, step };
            bestDistance = distance;
        }
    };
    runs.forEach((run, runIndex) => {
        const history = run?.result?.history;
        if (!Array.isArray(history)) return;
        const pixels = history.map(row => {
            const p = row?.point;
            return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
                ? [box.x + (p[0] - bounds[0]) / span * box.s,
                   box.y + (bounds[1] - p[1]) / span * box.s]
                : null;
        });
        pixels.forEach((p, step) => {
            if (p) consider(runIndex, step, (x - p[0]) ** 2 + (y - p[1]) ** 2);
            if (!p || step === 0 || !pixels[step - 1]) return;
            const prev = pixels[step - 1], dx = p[0] - prev[0], dy = p[1] - prev[1];
            const denom = dx * dx + dy * dy;
            if (denom < 1e-20) return;
            const fraction = Math.max(0, Math.min(1, ((x - prev[0]) * dx + (y - prev[1]) * dy) / denom));
            const sx = prev[0] + fraction * dx, sy = prev[1] + fraction * dy;
            consider(runIndex, fraction < .5 ? step - 1 : step, (x - sx) ** 2 + (y - sy) ** 2);
        });
    });
    return best;
}

/** Maps a pointer x-coordinate to a signal's time index, matching drawSignal padding. */
export function stepFromSignalChart(x, width, historyLength) {
    if (!Number.isSafeInteger(historyLength) || historyLength <= 0 || !Number.isFinite(x) || !Number.isFinite(width) || width < 12) return null;
    const q = Math.max(0, Math.min(1, (x - 5) / (width - 11)));
    return Math.round(q * (historyLength - 1));
}
