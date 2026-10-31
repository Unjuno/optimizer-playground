export const OPTIMIZERS = {
    sgd: { name: 'SGD', color: '#72d9a2', description: '現在の勾配の逆方向へ進む。', code: `// SGD · 勾配は loss の自動微分から取得します。
function step(a) {
  const g = a.grad(a.point);
  return {
    point: a.point.map((v, i) => v - a.params.lr * g[i]),
    metrics: { direction: g }
  };
}` },
    momentum: { name: 'Momentum', color: '#f1bd72', description: '勾配の指数移動平均を更新方向に使う。', code: `// 指数移動平均型 Momentum（初期値ゼロ）
function init(a) { return { m: [0, 0] }; }
function step(a) {
  const g = a.grad(a.point);
  const b = a.params.beta;
  const m = a.state.m.map((v, i) => b * v + (1 - b) * g[i]);
  return {
    point: a.point.map((v, i) => v - a.params.lr * m[i]),
    state: { m: m },
    metrics: { m: m }
  };
}` },
    adam: { name: 'Adam', color: '#a5a1ff', description: '一次・二次モーメントで更新幅を調整。', code: `// Adam · バイアス補正あり / epsilon は平方根の外
function init(a) { return { m: [0, 0], v: [0, 0] }; }
function step(a) {
  const g = a.grad(a.point);
  const b1 = a.params.beta, b2 = a.params.beta2;
  const m = a.state.m.map((v, i) => b1 * v + (1 - b1) * g[i]);
  const v = a.state.v.map((v, i) => b2 * v + (1 - b2) * g[i] * g[i]);
  const u = m.map((z, i) => (z / (1 - b1 ** a.t)) /
    (Math.sqrt(v[i] / (1 - b2 ** a.t)) + a.params.eps));
  return {
    point: a.point.map((z, i) => z - a.params.lr * u[i]),
    state: { m: m, v: v },
    metrics: { m: m, v: v, direction: u }
  };
}` },
    adamw: { name: 'AdamW', color: '#70cde7', description: 'Adamに、分離した重み減衰を加える。', code: `// AdamW · weight decay は勾配の移動平均に混ぜません。
function init(a) { return { m: [0, 0], v: [0, 0] }; }
function step(a) {
  const g = a.grad(a.point);
  const b1 = a.params.beta, b2 = a.params.beta2;
  const m = a.state.m.map((v, i) => b1 * v + (1 - b1) * g[i]);
  const v = a.state.v.map((v, i) => b2 * v + (1 - b2) * g[i] * g[i]);
  const u = m.map((z, i) => (z / (1 - b1 ** a.t)) /
    (Math.sqrt(v[i] / (1 - b2 ** a.t)) + a.params.eps));
  return {
    point: a.point.map((z, i) => (1 - a.params.lr * a.params.wd) * z - a.params.lr * u[i]),
    state: { m: m, v: v }, metrics: { m: m, v: v, direction: u }
  };
}` },
    lion: { name: 'Lion', color: '#f58eac', description: '履歴から作った方向の符号を使う。', code: `// Lion · 更新用と状態保存用で係数を分けます。
function init(a) { return { m: [0, 0] }; }
function step(a) {
  const g = a.grad(a.point);
  const u = g.map((v, i) => Math.sign(a.params.beta * a.state.m[i] + (1 - a.params.beta) * v));
  const m = a.state.m.map((v, i) => a.params.beta2 * v + (1 - a.params.beta2) * g[i]);
  return {
    point: a.point.map((v, i) => (1 - a.params.lr * a.params.wd) * v - a.params.lr * u[i]),
    state: { m: m }, metrics: { m: m, direction: u }
  };
}` },
    random: { name: 'Random search', color: '#f4e17c', description: '勾配を使わず、周辺の候補点を評価。', code: `// 勾配不要の例。seed 付き乱数は a.random() を使います。
function step(a) {
  const candidate = a.point.map(v => Math.max(a.bounds[0], Math.min(a.bounds[1],
    v + (a.random() * 2 - 1) * a.params.lr * 5)));
  const better = a.loss(candidate) < a.loss(a.point);
  return { point: better ? candidate : a.point, metrics: { accepted: better ? 1 : 0 } };
}` }
};
export function generateRecipe({ history = 'ema', transform = 'rms', clip = 0, decay = false } = {}) {
    if (!['none', 'ema'].includes(history) || !['none', 'rms', 'sign'].includes(transform))
        throw new Error('未知のレシピ部品です。');
    clip = Number(clip);
    if (!Number.isFinite(clip) || clip < 0 || clip > 1000)
        throw new Error('クリップ閾値が不正です。');
    return `// ビジュアルレシピから生成。自由に改造できます。
function init(a) { return { m: [0, 0], v: [0, 0] }; }
function step(a) {
  const g = a.grad(a.point);
  const m = a.state.m.map((v, i) => a.params.beta * v + (1 - a.params.beta) * g[i]);
  const v = a.state.v.map((v, i) => a.params.beta2 * v + (1 - a.params.beta2) * g[i] * g[i]);
  let u = ${history === 'ema' ? 'm.map(z => z / (1 - a.params.beta ** a.t))' : 'g.slice()'};
  ${transform === 'rms' ? 'u = u.map((z, i) => z / (Math.sqrt(v[i] / (1 - a.params.beta2 ** a.t)) + a.params.eps));' : transform === 'sign' ? 'u = u.map(z => Math.sign(z));' : '// 方向の変換なし'}
  ${clip > 0 ? `const norm = Math.hypot(u[0], u[1]);
  if (norm > ${clip}) u = u.map(z => z * ${clip} / norm);` : '// クリッピングなし'}
  return {
    point: a.point.map((z, i) => ${decay ? '(1 - a.params.lr * a.params.wd) * z' : 'z'} - a.params.lr * u[i]),
    state: { m: m, v: v }, metrics: { m: m, v: v, direction: u }
  };
}`;
}
