import { compileExpression } from './expression.js';
export const TERRAINS = [
    { id: 'bowl', name: 'ボウル', en: 'QUADRATIC', description: 'まずは滑らかな斜面から。更新幅の違いを観察。', expression: '(x^2+y^2)/2', bounds: [-3, 3], start: [-2.2, 1.8], minima: [[0, 0]], optimum: 0, target: 1e-4, lr: .08 },
    { id: 'ravine', name: '細長い谷', en: 'NARROW VALLEY', description: '左右の振動を抑えながら、谷の奥へ進む。', expression: '0.05*(x+y)^2+2.5*(x-y)^2', bounds: [-3, 3], start: [-2.4, 1.5], minima: [[0, 0]], optimum: 0, target: 1e-4, lr: .08 },
    { id: 'rosenbrock', name: '曲がった谷', en: 'ROSENBROCK', description: '方向を変える谷。勢いは味方にも敵にもなる。', expression: '(1-x)^2+20*(y-x^2)^2', bounds: [-2, 2], start: [-1.2, 1], minima: [[1, 1]], optimum: 0, target: 1e-3, lr: .003 },
    { id: 'himmelblau', name: '4つの谷', en: 'HIMMELBLAU', description: '同じ低さの谷が4つ。どこへたどり着く？', expression: '((x^2+y-11)^2+(x+y^2-7)^2)/50', bounds: [-5, 5], start: [-.5, 1], minima: [[3, 2], [-2.805118, 3.131312], [-3.77931, -3.283186], [3.584428, -1.848126]], optimum: 0, target: 1e-4, lr: .08 },
    { id: 'rastrigin', name: '波打つ地形', en: 'RASTRIGIN', description: '小さな谷が連なる地形。局所解への停滞を見る。', expression: '(20+x^2+y^2-10*cos(2*pi*x)-10*cos(2*pi*y))/10', bounds: [-3, 3], start: [2.4, 1.8], minima: [[0, 0]], optimum: 0, target: 1e-3, lr: .015 },
    { id: 'saddle', name: '分かれ道', en: 'DOUBLE WELL', description: '鞍点の近くから、左右どちらの谷へ進むか。', expression: '(x^2-1)^2+y^2/2', bounds: [-2.5, 2.5], start: [.12, 1.8], minima: [[-1, 0], [1, 0]], optimum: 0, target: 1e-4, lr: .05 },
    { id: 'plateau', name: '平坦な底', en: 'FLAT BOTTOM', description: 'ゴールに近づくほど小さくなる勾配。', expression: '(x^4+y^4)/4', bounds: [-2.5, 2.5], start: [-1.8, 1.6], minima: [[0, 0]], optimum: 0, target: 1e-4, lr: .06 }
];
export function makeTerrain(def = {}) {
    const p = TERRAINS.find(t => t.id === (def.preset || 'bowl'));
    if (!p)
        throw new Error('未知の地形です。');
    const expression = def.expression || p.expression;
    const base = compileExpression(expression);
    const bounds = def.bounds || p.bounds;
    if (!Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[1] || Math.max(...bounds.map(Math.abs)) > 100)
        throw new Error('地形の範囲が不正です。');
    const bumps = def.bumps || [];
    if (!Array.isArray(bumps) || bumps.length > 100)
        throw new Error('ブラシは最大100点です。');
    for (const b of bumps)
        if (!['x', 'y', 'a', 'r'].every(k => Number.isFinite(b[k])) || b.r < .03 || b.r > 10 || Math.abs(b.a) > 100)
            throw new Error('ブラシの値が不正です。');
    const evaluate = pnt => { let r = base(pnt[0], pnt[1]); for (const b of bumps) {
        let dx = pnt[0] - b.x, dy = pnt[1] - b.y, s = b.r * b.r, v = b.a * Math.exp(-(dx * dx + dy * dy) / (2 * s));
        r.value += v;
        r.gradient[0] -= v * dx / s;
        r.gradient[1] -= v * dy / s;
    } return r; };
    const custom = expression !== p.expression || bumps.length > 0 || bounds[0] !== p.bounds[0] || bounds[1] !== p.bounds[1];
    return { ...p, bounds, custom, expression, value: pnt => evaluate(pnt).value, gradient: pnt => evaluate(pnt).gradient, evaluate };
}
