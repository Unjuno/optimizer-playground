import {toCSV} from '../core/csv.js';
import { nearestTrajectoryStep, stepFromSignalChart } from './inspection.js';
import { TERRAINS, makeTerrain } from '../core/terrains.js';
import { OPTIMIZERS, generateRecipe } from '../core/optimizers.js';
import { CHALLENGE_LAYOUT } from '../core/challenge.js';
import { scoreRun, validateConfig, ENGINE_VERSION } from '../core/engine.js';
import { validateExperiment } from '../core/schema.js';
import { TerrainPlot, drawLoss, drawSignal, formatNumber } from './plots.js';
export function startApp() {
    const $ = id => document.getElementById(id), $$ = s => [...document.querySelectorAll(s)];
    const state = { terrainDef: { preset: 'ravine', bumps: [] }, terrain: null, start: [-2.4, 1.5], runs: [], focus: 0, step: 0, maxStep: 0, playing: false, tool: 'start', selected: 'momentum', computing: false, worker: null, workerURL: null, cancel: null, jobId: 0, sharedId: null, snapshot: null, benchmark: null, sharing: false, recipeUndo: null, quickComparison: null };
    const plot = new TerrainPlot($('terrainCanvas'));
    let frameLast = 0, frameAccum = 0, needsDraw = true, toastTimer;
    const statusLabels = { target: '目標到達', steps: '更新上限', budget: '評価予算', error: '実行エラー', 'runtime-limit': '実行制限', 'out-of-bounds': '範囲外', 'user-done': '手法が終了' };
    const addOption = (select, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; select.append(o); };
    TERRAINS.forEach(t => addOption($('terrainSelect'), t.id, t.name));
    Object.entries(OPTIMIZERS).forEach(([id, o]) => addOption($('optimizerSelect'), id, o.name));
    addOption($('optimizerSelect'), 'custom', '自作オプティマイザ');
    $('terrainSelect').value = 'ravine';
    $('optimizerSelect').value = 'momentum';
    function notify(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').className = 'notice' + (error ? ' error' : ''); }
    function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
    function redraw() { needsDraw = true; }
    function setPhase(p) { document.body.dataset.phase = p; }
    function setComputing(value) { state.computing = value; $('runButton').disabled = value; $('benchmarkButton').disabled = value; $('quickStartButton').disabled = value; $('quickCompareButton').disabled = value; $('stopButton').hidden = !value; $('runButton').hidden = value; setPhase(value ? 'computing' : state.playing ? 'replaying' : state.runs.length ? 'complete' : 'ready'); if (value) $('quickResult').textContent = '端末内でシミュレーションを実行中…'; }
    function stopWorker(message = '計算を停止しました。') { if (state.cancel) {
        state.cancel(new Error(message));
        state.cancel = null;
    } if (state.worker) {
        state.worker.terminate();
        state.worker = null;
    } if (state.workerURL) {
        URL.revokeObjectURL(state.workerURL);
        state.workerURL = null;
    } setComputing(false); }
    function invalidate({ preserveQuickComparison = false } = {}) { stopWorker('編集によって前の計算を中止しました。'); if (!preserveQuickComparison) state.quickComparison = null; state.runs = []; state.snapshot = null; state.benchmark = null; state.step = 0; state.maxStep = 0; state.playing = false; $('benchmarkPanel').hidden = true; $('benchmarkRows').replaceChildren(); document.body.dataset.resultsCount = '0'; $('runLegend').replaceChildren(); $('resultsTable').tBodies[0].replaceChildren(); $('timeline').value = 0; $('stepNow').textContent = '0'; $('stepTotal').textContent = $('maxSteps').value; $('runStatus').textContent = 'READY'; $('statusText').textContent = '変更後の実行を待っています'; $('runReason').textContent = '結果は次の実行で更新されます。'; setPhase('ready'); updateCodeLabel(); updateReadouts(); updateQuickUI(); redraw(); }
    function updateTerrain() { state.terrain = makeTerrain(state.terrainDef); $('terrainDescription').textContent = state.terrain.custom ? '編集済みの地形。大域最適値は既知ではありません。' : state.terrain.description; $('terrainTag').textContent = state.terrain.custom ? 'CUSTOM LANDSCAPE' : state.terrain.en; $('brushCount').textContent = String(state.terrainDef.bumps?.length || 0); $('expressionInput').value = state.terrain.expression; plot.key = ''; redraw(); }
    function updateCodeLabel() { let o = OPTIMIZERS[state.selected]; $('codeLabel').textContent = o ? state.selected + '.js' : 'my-optimizer.js'; $('optimizerDescription').textContent = o ? o.description : '独自の更新規則・状態・評価手順を記述できます。'; $('codeChars').textContent = $('codeEditor').value.length.toLocaleString() + ' / 20,000'; $('lineNumbers').textContent = Array.from({ length: $('codeEditor').value.split('\n').length }, (_, i) => i + 1).join('\n'); if (!state.runs.length) {
        $('focusName').textContent = o?.name || 'My optimizer';
        $('focusDot').style.background = o?.color || '#c8f68a';
    } }
    function clearRecipeUndo() { state.recipeUndo = null; $('undoRecipe').disabled = true; }
    function loadOptimizer(id) { if (id !== 'custom') {
        $('codeEditor').value = OPTIMIZERS[id].code;
        clearRecipeUndo();
    } state.selected = id; $('optimizerSelect').value = id; updateCodeLabel(); }
    function params() { return { lr: Number($('learningRate').value), beta: Number($('betaRange').value), beta2: Number($('beta2').value), eps: 1e-8, wd: Number($('weightDecay').value) }; }
    function getConfig() { return { terrain: JSON.parse(JSON.stringify(state.terrainDef)), start: [Number($('startX').value), Number($('startY').value)], params: params(), maxSteps: Number($('maxSteps').value), maxCalls: Number($('maxCalls').value), seed: Number($('seed').value) }; }
    function candidates() { const main = state.selected === 'custom' ? { id: 'custom', name: 'My optimizer', color: '#c8f68a', code: $('codeEditor').value } : { id: state.selected, ...OPTIMIZERS[state.selected], code: $('codeEditor').value }; const refs = $$('input[name=reference]:checked').map(e => e.value).filter(id => id !== main.id).map(id => ({ id, ...OPTIMIZERS[id] })); return [main, ...refs].slice(0, 4).map(({ id, name, color, code }) => ({ id, name, color, code })); }
    function updateQuickUI() {
        const main = state.runs[0], result = main?.result;
        const usable = result && result.history.length && !['error', 'runtime-limit', 'out-of-bounds'].includes(result.status);
        $('quickStartButton').textContent = usable ? '↻ 同じ条件でもう一度' : '▶ 現在の条件で実行';
        const beta = Number($('betaRange').value);
        const nextBeta = Math.abs(beta - .2) < .0005 ? .9 : .2;
        $('quickCompareButton').hidden = !(usable && state.selected === 'momentum');
        $('quickCompareButton').textContent = `β=${nextBeta.toFixed(2)} で比較`;
        $('previousPathControl').hidden = !(result && state.quickComparison?.history?.length);
        if (!$('previousPathControl').hidden) $('previousPathLabel').textContent = `前回 β=${state.quickComparison.beta.toFixed(2)}（破線）を表示`;
        if (state.computing) return;
        if (!usable) {
            if (result && state.quickComparison) {
                const old = state.quickComparison;
                $('quickResult').textContent = `β=${beta.toFixed(2)} の実験は「${statusLabels[result.status] || result.status}」で停止。前回 β=${old.beta.toFixed(2)} の最良損失は ${formatNumber(old.bestLoss)}、今回は ${formatNumber(result.bestLoss)}。破線で前回の経路を確認できます。`;
            } else {
                $('quickResult').textContent = result ? `「${statusLabels[result.status] || result.status}」で停止しました。設定やコードを確認してください。` : '結果を見たら、移動平均の係数 β を一つ変えてみましょう。';
            }
            return;
        }
        const best = `最良損失 ${formatNumber(result.bestLoss)}`;
        const score = scoreRun(result);
        if (state.quickComparison) {
            const old = state.quickComparison;
            const trend = result.bestLoss < old.bestLoss ? '今回はより小さな損失を観測。' : result.bestLoss > old.bestLoss ? '今回は前回より損失が大きい結果。' : '今回は同じ最良損失でした。';
            const values = old.score === null || score === null ? '' : ` / スコア ${old.score} → ${score}`;
            $('quickResult').textContent = `同条件で β=${old.beta.toFixed(2)}：${formatNumber(old.bestLoss)} → β=${beta.toFixed(2)}：${formatNumber(result.bestLoss)}${values}。${trend}この地形だけの観測です。`;
        } else {
            $('quickResult').textContent = `観測：${main.name} の${best}${score === null ? '' : ` / スコア ${score}`}。次は β を変えると軌跡がどうなるか試せます。`;
        }
    }
    async function runQuickExperiment(compare = false) {
        if (state.computing) return;
        if (compare) {
            const main = state.runs[0];
            if (!main || state.selected !== 'momentum') return;
            const beta = Number($('betaRange').value);
            const nextBeta = Math.abs(beta - .2) < .0005 ? .9 : .2;
            state.quickComparison = { beta, bestLoss: main.result.bestLoss, score: scoreRun(main.result), history: main.result.history };
            $('showPreviousPath').checked = true;
            $('betaRange').value = String(nextBeta);
            $('betaValue').textContent = nextBeta.toFixed(2);
            invalidate({ preserveQuickComparison: true });
        } else {
            state.quickComparison = null;
        }
        await runExperiment();
        if (state.runs.length) {
            document.querySelector('.landscape-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        }
    }
    function runJobs(jobs, onResult = () => { }) {
        stopWorker();
        setComputing(true);
        const id = ++state.jobId;
        return new Promise((resolve, reject) => {
            let worker;
            if (globalThis.__OPTIMIZER_WORKER__) {
                state.workerURL = URL.createObjectURL(new Blob([globalThis.__OPTIMIZER_WORKER__], { type: 'text/javascript' }));
                worker = new Worker(state.workerURL);
            }
            else
                worker = new Worker(new URL('./worker.js', location.href));
            state.worker = worker;
            const results = [];
            let settled = false;
            const cleanup = () => { clearTimeout(timer); worker.terminate(); if (state.worker === worker)
                state.worker = null; if (state.workerURL) {
                URL.revokeObjectURL(state.workerURL);
                state.workerURL = null;
            } state.cancel = null; setComputing(false); };
            const finish = (error) => { if (settled)
                return; settled = true; cleanup(); error ? reject(error) : resolve(results); };
            const timer = setTimeout(() => finish(new Error('実行時間の上限に達したため停止しました。')), Math.min(45000, 8000 + jobs.length * 1000));
            state.cancel = error => finish(error);
            worker.onmessage = e => { const m = e.data; if (m.id !== id)
                return; if (m.type === 'result') {
                results[m.index] = m.result;
                onResult(m.index, m.result);
            }
            else if (m.type === 'done')
                finish();
            else if (m.type === 'error')
                finish(new Error(m.message)); };
            worker.onerror = e => finish(new Error(e.message || 'Workerを開始できませんでした。'));
            worker.postMessage({ id, jobs });
        });
    }
    async function runExperiment() {
        try {
            const config = getConfig();
            validateConfig(config);
            state.start = config.start.slice();
            const opts = candidates();
            if (!opts[0].code.trim())
                throw new Error('オプティマイザのコードを入力してください。');
            state.playing = false;
            state.runs = [];
            state.snapshot = null;
            state.step = 0;
            document.body.dataset.resultsCount = '0';
            $('notice').hidden = true;
            $('statusText').textContent = '計算中';
            $('runReason').textContent = '描画と独立して最適化を計算しています。';
            redraw();
            const results = await runJobs(opts.map(o => ({ config, code: o.code })), i => { $('statusText').textContent = `計算中 ${i + 1} / ${opts.length}`; });
            state.runs = results.map((r, i) => ({ id: opts[i].id, name: opts[i].name, color: opts[i].color, result: r }));
            state.focus = 0;
            state.maxStep = Math.max(0, ...results.map(r => r.history.length - 1), state.quickComparison?.history?.length - 1 || 0);
            state.step = 0;
            state.playing = state.maxStep > 0;
            frameAccum = 0;
            state.snapshot = { config, optimizers: opts, results: state.runs, engine: ENGINE_VERSION, environment: `${navigator.userAgent.slice(0, 160)} / CPU FP64` };
            document.body.dataset.resultsCount = String(state.runs.length);
            $('timeline').max = state.maxStep;
            $('stepTotal').textContent = String(state.maxStep);
            renderLegend();
            renderResults();
            updateReadouts();
            updateQuickUI();
            setPhase(state.playing ? 'replaying' : 'complete');
            redraw();
        }
        catch (e) {
            notify(e.message, true);
            $('statusText').textContent = '実行を停止';
            $('runReason').textContent = e.message;
            setComputing(false);
            updateQuickUI();
        }
    }
    function renderLegend() { const el = $('runLegend'); el.replaceChildren(); state.runs.forEach((r, i) => { const b = document.createElement('button'); b.className = 'legend-button' + (state.focus === i ? ' active' : ''); const mark = document.createElement('i'); mark.className = 'line-key'; mark.style.color = r.color; const text = document.createElement('span'); text.textContent = r.name; b.append(mark, text); b.onclick = () => { state.focus = i; renderLegend(); updateReadouts(); redraw(); }; el.append(b); }); }
    function renderResults() { const body = $('resultsTable').tBodies[0]; body.replaceChildren(); state.runs.forEach(r => { const row = document.createElement('tr'), s = scoreRun(r.result), cells = [r.name, s === null ? '—' : String(s), formatNumber(r.result.finalLoss), formatNumber(r.result.bestLoss), `${r.result.counts.loss} / ${r.result.counts.grad}`, r.result.elapsedMs.toFixed(1), statusLabels[r.result.status] || r.result.status]; for (const v of cells) {
        const td = document.createElement('td');
        td.textContent = v;
        row.append(td);
    } row.firstChild.style.color = r.color; body.append(row); }); }
    function updateReadouts() {
        const axis = Number($('signalAxis').value);
        const run = state.runs[state.focus], r = run?.result, h = r?.history[Math.min(state.step, Math.max(0, r.history.length - 1))];
        $('pauseButton').textContent = state.playing ? 'Ⅱ' : '▶';
        $('timeline').value = String(state.step);
        $('stepNow').textContent = String(state.step);
        if (!r || !h) {
            for (const id of ['currentLoss', 'bestLoss', 'positionX', 'positionY', 'gradientNorm', 'updateNorm', 'scoreValue'])
                $(id).textContent = '—';
            $('scoreCaption').textContent = '実行すると、この地形での結果を表示';
            $('metricsTable').replaceChildren();
            for (const id of ['stepGradient', 'stepMomentum', 'stepUpdate']) $(id).textContent = '—';
            return;
        }
        $('focusName').textContent = run.name;
        $('focusDot').style.background = run.color;
        $('runStatus').textContent = r.status === 'target' ? 'REACHED' : ['error', 'runtime-limit', 'out-of-bounds'].includes(r.status) ? 'ERROR' : 'RESULT';
        const score = scoreRun(r);
        $('scoreValue').textContent = score === null ? '—' : String(score);
        $('scoreCaption').textContent = score === null ? '編集地形のため採点対象外' : 'この設定での自己評価・未検証';
        $('currentLoss').textContent = formatNumber(h.loss);
        $('bestLoss').textContent = formatNumber(h.best);
        $('positionX').textContent = formatNumber(h.point[0]);
        $('positionY').textContent = formatNumber(h.point[1]);
        $('gradientNorm').textContent = h.gradientAtPoint ? formatNumber(Math.hypot(...h.gradientAtPoint)) : '—';
        $('stepGradient').textContent = formatNumber(h.gradient[axis]);
        $('stepMomentum').textContent = formatNumber(h.metrics?.['m' + axis]);
        $('stepUpdate').textContent = formatNumber(h.update[axis]);
        $('updateNorm').textContent = formatNumber(Math.hypot(...h.update));
        $('statusText').textContent = state.playing ? '記録を再生中' : `計算完了 · ${statusLabels[r.status] || r.status}`;
        $('runReason').textContent = r.message + `。f: ${r.counts.loss} / g: ${r.counts.grad} / 描画診断: ${r.counts.diagnostic}`;
        const table = $('metricsTable');
        table.replaceChildren();
        for (const [k, v] of Object.entries(h.metrics || {})) {
            const row = document.createElement('div'), key = document.createElement('span'), val = document.createElement('strong');
            key.textContent = k;
            val.textContent = formatNumber(v);
            row.append(key, val);
            table.append(row);
        }
        if (!table.childElementCount) {
            const p = document.createElement('p');
            p.className = 'micro';
            p.textContent = 'この手法は追加の観測値を返していません。';
            table.append(p);
        }
    }
    function scrub(step) { state.playing = false; state.step = Math.max(0, Math.min(state.maxStep, Math.round(step))); setPhase(state.runs.length ? 'complete' : 'ready'); updateReadouts(); redraw(); }
    function tab(name) { $$('[data-tab]').forEach(b => { const active = b.dataset.tab === name; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); }); for (const n of ['code', 'visual', 'results'])
        $(n + 'Panel').hidden = n !== name; }
    async function benchmark() {
        try {
            const code = $('codeEditor').value;
            const defaults = { beta: .9, beta2: .999, eps: 1e-8, wd: .01 };
            const definitions = CHALLENGE_LAYOUT;
            const cases = [], jobs = [];
            for (const [id, starts] of definitions) {
                const p = TERRAINS.find(t => t.id === id);
                starts.forEach((start, i) => { const config = { terrain: { preset: id, bumps: [] }, start, params: { ...defaults, lr: p.lr }, maxSteps: 300, maxCalls: 1200, seed: i + 1 }; cases.push({ name: p.name, start, config }); jobs.push({ config, code }, { config, code: OPTIMIZERS.sgd.code }); });
            }
            state.playing = false;
            $('benchmarkPanel').hidden = false;
            $('benchmarkRows').replaceChildren();
            $('benchmarkSummary').textContent = '0 / 9';
            $('benchmarkPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
            const all = await runJobs(jobs, (i, r) => { if (i % 2 === 1)
                $('benchmarkSummary').textContent = `${(i + 1) / 2} / 9`; });
            let total = 0, baseline = 0;
            const rows = cases.map((c, i) => { const r = all[i * 2], ref = all[i * 2 + 1], score = scoreRun(r) || 0, refScore = scoreRun(ref) || 0; total += score; baseline += refScore; const row = document.createElement('tr'); for (const v of [`${c.name} (${c.start.join(', ')})`, score, refScore, formatNumber(r.finalLoss), r.counts.loss + r.counts.grad, statusLabels[r.status]]) {
                const cell = document.createElement('td');
                cell.textContent = String(v);
                row.append(cell);
            } $('benchmarkRows').append(row); return { preset: c.config.terrain.preset, start: c.start, seed: c.config.seed, score, baseline: refScore, finalLoss: r.finalLoss, calls: r.counts.loss + r.counts.grad, status: r.status }; });
            state.benchmark = { protocol: 'suite-v1', code, rows, score: Math.round(total / 9), baseline: Math.round(baseline / 9) };
            if (!state.snapshot) {
                const o = { id: 'custom', name: 'My optimizer', color: '#c8f68a', code };
                state.snapshot = { config: cases[0].config, optimizers: [o], results: [{ id: o.id, name: o.name, color: o.color, result: all[0] }], engine: ENGINE_VERSION, environment: `${navigator.userAgent.slice(0, 160)} / CPU FP64` };
            }
            $('benchmarkSummary').textContent = `平均 ${Math.round(total / 9)} / 1000 · SGD ${Math.round(baseline / 9)}`;
            toast('9条件の比較が完了しました。数値は自己実行結果です。');
        }
        catch (e) {
            notify(e.message, true);
            $('benchmarkSummary').textContent = '停止: ' + e.message;
            setComputing(false);
        }
    }
    function renderBenchmark(b) {
        $('benchmarkPanel').hidden = false;
        $('benchmarkRows').replaceChildren();
        for (const r of b.rows) {
            const row = document.createElement('tr');
            const label = TERRAINS.find(t => t.id === r.preset)?.name || r.preset;
            for (const value of [`${label} (${r.start.join(', ')})`, r.score, r.baseline, formatNumber(r.finalLoss), r.calls, statusLabels[r.status]]) {
                const td = document.createElement('td');
                td.textContent = String(value);
                row.append(td);
            }
            $('benchmarkRows').append(row);
        }
        $('benchmarkSummary').textContent = `平均 ${b.score} / 1000 · SGD ${b.baseline} · 共有された未検証記録`;
    }
    function applyConfig(config, optimizer) { state.terrainDef = JSON.parse(JSON.stringify(config.terrain)); state.terrainDef.bumps = state.terrainDef.bumps || []; state.start = config.start.slice(); $('terrainSelect').value = state.terrainDef.preset; $('startX').value = config.start[0]; $('startY').value = config.start[1]; $('learningRate').value = config.params.lr; $('betaRange').value = config.params.beta; $('betaValue').textContent = config.params.beta.toFixed(3); $('beta2').value = config.params.beta2; $('weightDecay').value = config.params.wd; $('seed').value = config.seed; $('maxSteps').value = config.maxSteps; $('maxCalls').value = config.maxCalls; $('codeEditor').value = optimizer.code; state.selected = 'custom'; $('optimizerSelect').value = 'custom'; updateCodeLabel(); updateTerrain(); }
    async function loadShared() { const id = new URL(location.href).searchParams.get('s'); if (!id)
        return; if (!/^[a-f0-9]{32}$/.test(id)) {
        notify('共有URLのIDが不正です。', true);
        return;
    } try {
        const response = await fetch('./api/posts/' + id);
        const post = await response.json();
        if (!response.ok)
            throw new Error(post.error || '投稿を取得できませんでした。');
        const e = validateExperiment(post.experiment);
        applyConfig(e.config, e.optimizers[0]);
        state.sharedId = id;
        state.runs = e.results;
        state.focus = 0;
        state.maxStep = Math.max(0, ...e.results.map(r => r.result.history.length - 1));
        state.step = state.maxStep;
        state.playing = false;
        state.snapshot = e;
        state.benchmark = e.benchmark || null;
        if (state.benchmark)
            renderBenchmark(state.benchmark);
        document.body.dataset.shared = 'true';
        document.body.dataset.resultsCount = String(e.results.length);
        $('sharedBanner').hidden = false;
        $('sharedTitle').textContent = post.title;
        $('postTitle').value = post.title;
        $('timeline').max = state.maxStep;
        $('stepTotal').textContent = String(state.maxStep);
        $$('input[name=reference]').forEach(box => box.checked = e.optimizers.slice(1).some(o => o.id === box.value));
        renderLegend();
        renderResults();
        updateReadouts();
        updateQuickUI();
        setPhase('complete');
        redraw();
    }
    catch (e) {
        notify(e.message, true);
    } }
    function showShare() {
        const dialog = $('shareDialog');
        $('publishedInfo').hidden = true;
        $('createdDeleteKey').value = '';
        $('publishConsent').checked = false;
        $('shareMessage').textContent = '';
        $('publishButton').disabled = !state.sharing || !state.snapshot;
        $('sharePreview').textContent = state.snapshot ? `${state.snapshot.optimizers.map(o => o.name).join(' / ')}\n地形: ${TERRAINS.find(t => t.id === state.snapshot.config.terrain.preset)?.name || '編集地形'} · ${state.snapshot.config.maxSteps}更新 / ${state.snapshot.config.maxCalls}評価コール\n送信内容: コード、地形、条件、数値履歴、ブラウザ情報${state.benchmark ? '、共通チャレンジの概要' : ''}${state.quickComparison ? '\n※前回の比較軌跡は投稿に含まれません（現在の実験のみ公開）。' : ''}` : '実行した実験がありません。まずコードを実行してください。';
        $('sharePreview').style.whiteSpace = 'pre-line';
        if (!state.sharing)
            $('shareMessage').textContent = 'この配布形式では投稿APIに接続されていません。同梱サーバー版で開くと共有URLと削除キーを発行できます。';
        dialog.showModal();
    }
    async function publish() { if (!$('publishConsent').checked) {
        $('shareMessage').textContent = '公開への同意をチェックしてください。';
        return;
    } if (!state.snapshot)
        return; $('publishButton').disabled = true; try {
        let experiment = JSON.parse(JSON.stringify(state.snapshot));
        if (state.benchmark)
            experiment.benchmark = state.benchmark;
        const response = await fetch('./api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, title: $('postTitle').value, experiment }) });
        const post = await response.json();
        if (!response.ok)
            throw new Error(post.error || '投稿に失敗しました。');
        const u = new URL(location.href);
        u.search = '';
        u.hash = '';
        u.searchParams.set('s', post.id);
        $('shareURL').value = u.href;
        $('createdDeleteKey').value = post.deleteKey;
        $('publishedInfo').hidden = false;
        $('shareMessage').textContent = '投稿しました。削除キーを控えてください。';
        state.sharedId = post.id;
        $('sharedBanner').hidden = false;
        $('sharedTitle').textContent = '公開済み: ' + $('postTitle').value;
    }
    catch (e) {
        $('shareMessage').textContent = e.message;
    }
    finally {
        $('publishButton').disabled = false;
    } }
    async function deletePost() { if (!state.sharedId)
        return; $('confirmDelete').disabled = true; try {
        const r = await fetch('./api/posts/' + state.sharedId, { method: 'DELETE', headers: { 'X-Delete-Key': $('deleteKeyInput').value } });
        if (!r.ok) {
            const e = await r.json();
            throw new Error(e.error || '削除できませんでした。');
        }
        $('deleteMessage').textContent = '投稿を削除しました。このブラウザ内の実験はそのまま残ります。';
        $('sharedBanner').hidden = true;
        $('deleteKeyInput').value = '';
        state.sharedId = null;
        const u = new URL(location.href);
        u.searchParams.delete('s');
        history.replaceState(null, '', u);
        delete document.body.dataset.shared;
    }
    catch (e) {
        $('deleteMessage').textContent = e.message;
    }
    finally {
        $('confirmDelete').disabled = false;
    } }
    function help(kind = 'guide') {
        const c = $('helpContent');
        c.replaceChildren();
        const sections = kind === 'api' ? [['コードの入出力', `任意の履歴・条件分岐・ループ・配列（行列）を組み合わせられます。init は省略可、step は必須です。JavaScriptの全構文や任意ライブラリへの互換性はありません。`], ['利用できる機能', 'Math の数値関数、配列の map / reduce / filter / slice / push など、関数、if、for、for...of、while、分割代入。ネットワーク、DOM、eval、import、class、async、Date は提供しません。'], ['制限', '1実行200万命令、累積20万要素、配列長1万、再帰64段、コード2万文字。制限超過・エラー・範囲外を成功として扱いません。メモリ使用量の実測値は提供しません。']] : kind === 'privacy' ? [['計算と投稿を分ける', '最適化はブラウザ内のCPUで実行します。GPUと実際のモデル学習はこの版にはありません。外部CDN・解析ツール・個人用保存は使いません。投稿操作までは、実験コードや記録を送信しません。'], ['共有と削除', '共有URLは転送可能な公開リンクです。秘密の保管場所ではありません。共有ページを開いても、投稿コードは自動実行しません。削除キーの平文はサーバー保存せず、ハッシュ照合で削除します。保存期間は既定30日です。外部コピーの削除・紛失キーの復旧はできません。'], ['検証範囲', '投稿スコアは自己申告・未検証です。独立した再実行や安全性監査に合格したという意味ではありません。サーバーには投稿連投を抑える制限を設けていますが、大規模な公開運用では追加の監視が必要です。']] : kind === 'score' ? [['点数の意味', '既知の最適値がある未編集のプリセットで採点します。初期の損失と最終損失の差を対数尺度で測り、目標閾値までの改善を最大800点に変換します。目標に到達した場合だけ、残った評価予算の割合に応じて最大200点を加えます。'], ['比較のルール', '同じ地形・開始点・予算で比較してください。最初から目標にある場合は0点です。手描き・数式変更では真の最適値が不明なので採点しません。エラー・実行制限・範囲外で終了した実行は0点です。更新1回と評価1回は別です。目的関数と勾配はそれぞれ1コールで、これは実演算量や計算時間と等価ではありません。'], ['共通チャレンジ', '3地形・各3開始点を使用。300更新、1,200評価コール、地形規定の学習率、β=0.9、β₂=0.999、ε=1e-8、減衰0.01を固定します。サイドバーのパラメータではなく、コードのみを持ち込みます。9条件を同じ重みで平均します。']] : [['まずは一歩、変えてみる', '地形と更新規則を選び、「実行してみる」を押します。勾配の逆方向（ピンク）と実際の更新（ライム）が同じになるか見てください。学習率や履歴を残す割合を変えると、経路も変わります。'], ['2つの分析を同期する', '地形では空間上の経路、下のチャートでは損失の時間変化、右では勾配・移動平均・更新量を観察できます。タイムラインや損失チャートをクリックすると、その時点に同期します。勾配・更新の矢印は更新前の位置を起点に描画します。'], ['手描きの地形も実際に計算する', '「山」「谷」を選んで地形をなぞると、滑らかなガウス形状を追加します。見た目だけでなく、目的関数と解析勾配が変わります。最大100点。範囲外の移動は自動補正せず停止します。'], ['視覚編集と自由なコード', 'ビジュアルの部品からコードを生成し、自由に改造できます。任意コードを完全にノードへ逆変換するものではありません。コードが正本です。'], ['再生と計算', '数値計算をWorkerで終えてから記録を再生します。再生速度は最適化の結果を変えません。停止は計算中断、一時停止は記録再生の停止です。共有は任意で、再読み込みすると未投稿の作業は消えます。']];
        for (const [t, p] of sections) {
            const h = document.createElement('h3');
            h.textContent = t;
            const el = document.createElement('p');
            el.textContent = p;
            c.append(h, el);
        }
        if (kind === 'api') {
            const table = document.createElement('table');
            const rows = [['名前 / 型', '意味・範囲', '単位'], ['a.point / 配列', '更新前の2次元座標。地形の定義域内。', '無次元'], ['a.state / 値', 'init / 前の step が返した内部状態。', '内容による'], ['a.params / オブジェクト', 'lr, beta, beta2, eps, wd。設定値。', '無次元'], ['a.t / 整数', '更新番号。初回は1。', '無次元'], ['a.loss(point) / 関数', '点を評価し、損失を返す。1評価コール。', '無次元'], ['a.grad(point) / 関数', '解析勾配の2要素配列を返す。1評価コール。', '無次元'], ['a.random() / 関数', 'seed付き乱数。0以上1未満。', '無次元'], ['a.bounds / 配列', '座標の下限と上限。両軸共通。', '無次元'], ['戻り値 / オブジェクト', 'point 必須。state / metrics / points / done は任意。', '内容による']];
            for (const vals of rows) {
                const tr = document.createElement('tr');
                vals.forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.append(td); });
                table.append(tr);
            }
            c.prepend(table);
            const pre = document.createElement('pre');
            pre.textContent = 'function init(a) { return { m: [0, 0] }; }\nfunction step(a) {\n  const g = a.grad(a.point);\n  const m = g.map((v, i) => 0.9 * a.state.m[i] + 0.1 * v);\n  return {\n    point: a.point.map((v, i) => v - a.params.lr * m[i]),\n    state: { m: m }, metrics: { m: m }\n  };\n}';
            c.append(pre);
        }
        $('helpDialog').showModal();
    }
    // Events: every change invalidates prior numerical results rather than silently relabeling them.
    $('terrainSelect').onchange = () => { const p = TERRAINS.find(t => t.id === $('terrainSelect').value); state.terrainDef = { preset: p.id, bumps: [] }; state.start = p.start.slice(); $('startX').value = p.start[0]; $('startY').value = p.start[1]; $('learningRate').value = p.lr; invalidate(); updateTerrain(); };
    $('optimizerSelect').onchange = () => { loadOptimizer($('optimizerSelect').value); invalidate(); };
    $('applyExpression').onclick = () => { try {
        const next = { ...state.terrainDef, expression: $('expressionInput').value.trim() };
        const t = makeTerrain(next);
        t.value(state.start);
        state.terrainDef = next;
        invalidate();
        updateTerrain();
        toast('目的関数を変更しました。');
    }
    catch (e) {
        notify(e.message, true);
    } };
    for (const id of ['startX', 'startY', 'learningRate', 'beta2', 'weightDecay', 'seed', 'maxSteps', 'maxCalls'])
        $(id).addEventListener('change', () => { invalidate(); state.start = [Number($('startX').value), Number($('startY').value)]; redraw(); });
    $('betaRange').oninput = () => { $('betaValue').textContent = Number($('betaRange').value).toFixed(3); invalidate(); };
    $$('input[name=reference]').forEach(e => e.onchange = invalidate);
    $('codeEditor').oninput = () => { clearRecipeUndo(); state.selected = 'custom'; $('optimizerSelect').value = 'custom'; invalidate(); updateCodeLabel(); };
    $('codeEditor').onscroll = () => { $('lineNumbers').scrollTop = $('codeEditor').scrollTop; };
    $('codeEditor').onkeydown = e => { if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.target, a = el.selectionStart, b = el.selectionEnd;
        el.setRangeText('  ', a, b, 'end');
        el.dispatchEvent(new Event('input'));
    } };
    $('quickStartButton').onclick = () => runQuickExperiment();
    $('quickCompareButton').onclick = () => runQuickExperiment(true);
    $('runButton').onclick = runExperiment;
    $('stopButton').onclick = () => { stopWorker(); state.playing = false; notify('計算を停止しました。'); };
    $('pauseButton').onclick = () => { if (!state.runs.length) {
        toast('先に実験を実行してください。');
        return;
    } if (state.step >= state.maxStep)
        state.step = 0; state.playing = !state.playing; frameAccum = 0; setPhase(state.playing ? 'replaying' : 'complete'); updateReadouts(); redraw(); };
    $('stepButton').onclick = () => scrub(state.step + 1);
    $('resetPlayback').onclick = () => scrub(0);
    $('timeline').oninput = () => scrub(Number($('timeline').value));
    $('showPreviousPath').onchange = redraw;
    $('showField').onchange = redraw;
    $('chartAxis').onchange = redraw;
    $('signalAxis').onchange = () => { updateReadouts(); redraw(); };
    $('signalCanvas').onclick = e => {
        const history = state.runs[state.focus]?.result.history;
        if (!history?.length) return;
        const bounds = $('signalCanvas').getBoundingClientRect();
        const index = stepFromSignalChart(e.clientX - bounds.left, bounds.width, history.length);
        if (index !== null) scrub(index);
    };
    $('signalCanvas').onkeydown = e => {
        if (!state.runs.length) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            scrub(state.step + (e.key === 'ArrowRight' ? 1 : -1));
        }
    };
    $('lossCanvas').onclick = e => { if (!state.runs.length)
        return; const r = $('lossCanvas').getBoundingClientRect(), q = Math.max(0, Math.min(1, (e.clientX - r.left - 45) / (r.width - 63))), xkey = $('chartAxis').value; const h = state.runs[state.focus].result.history; if (xkey === 't')
        scrub(q * state.maxStep);
    else {
        const xmax = Math.max(...state.runs.map(r => r.result.history.at(-1)?.calls || 1));
        let best = 0;
        for (let i = 1; i < h.length; i++)
            if (Math.abs(h[i].calls - q * xmax) < Math.abs(h[best].calls - q * xmax))
                best = i;
        scrub(best);
    } };
    $$('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
    $$('[data-tool]').forEach(b => b.onclick = () => {
        state.tool = b.dataset.tool;
        $$('[data-tool]').forEach(t => { t.classList.toggle('active', t === b); if (t.dataset.tool === 'inspect') t.setAttribute('aria-pressed', String(t === b)); });
        $('mapTip').textContent = state.tool === 'start' ? 'クリックで開始点を配置' : state.tool === 'raise' ? 'ドラッグで山を描く' : state.tool === 'lower' ? 'ドラッグで谷を描く' : '軌跡をクリックして更新を調べる';
        redraw();
    });
    let drawing = false, lastPaint = null;
    function paint(e) {
        if (state.tool === 'inspect') {
            if (!state.runs.length) { toast('先に実験を実行してください。'); return; }
            const rect = $('terrainCanvas').getBoundingClientRect();
            const selection = nearestTrajectoryStep({ runs: state.runs, bounds: state.terrain.bounds, box: plot.box, x: e.clientX - rect.left, y: e.clientY - rect.top, focused: state.focus, radius: e.pointerType === 'touch' ? 26 : 18 });
            if (selection) {
                state.focus = selection.runIndex; renderLegend(); scrub(selection.step);
            } else { toast('軌跡の近くを選択してください。'); }
            return;
        }
        const p = plot.coordinate(e.clientX, e.clientY, state.terrain.bounds); if (!p)
        return; if (state.tool === 'start') {
        state.start = p.map(v => Math.round(v * 1000) / 1000);
        $('startX').value = state.start[0];
        $('startY').value = state.start[1];
        invalidate();
        return;
    } const span = state.terrain.bounds[1] - state.terrain.bounds[0]; if (lastPaint && Math.hypot(p[0] - lastPaint[0], p[1] - lastPaint[1]) < span * .025)
        return; if (state.terrainDef.bumps.length >= 100) {
        toast('ブラシは最大100点です。「消去」でリセットできます。');
        return;
    } lastPaint = p; state.terrainDef.bumps.push({ x: p[0], y: p[1], a: (state.tool === 'raise' ? 1 : -1) * .8, r: span * .09 }); invalidate(); updateTerrain(); }
    $('terrainCanvas').onpointerdown = e => {
        if (state.tool === 'inspect') { paint(e); return; }
        drawing = true; lastPaint = null; $('terrainCanvas').setPointerCapture(e.pointerId); paint(e);
    };
    $('terrainCanvas').onpointermove = e => { if (drawing && state.tool !== 'start')
        paint(e); };
    $('terrainCanvas').onpointerup = () => drawing = false;
    $('terrainCanvas').onpointercancel = () => drawing = false;
    $('clearBrush').onclick = () => { state.terrainDef.bumps = []; invalidate(); updateTerrain(); toast('手描きの地形を消去しました。'); };
    $('applyRecipe').onclick = () => { try {
        const code = generateRecipe({ history: $('recipeHistory').value, transform: $('recipeTransform').value, clip: Number($('recipeClip').value), decay: $('recipeDecay').checked });
        state.recipeUndo = { code: $('codeEditor').value, selected: state.selected };
        $('undoRecipe').disabled = false;
        $('codeEditor').value = code;
        state.selected = 'custom';
        $('optimizerSelect').value = 'custom';
        invalidate();
        updateCodeLabel();
        toast('部品の設定からコードを生成しました。');
    }
    catch (e) {
        notify(e.message, true);
    } };
    $('undoRecipe').onclick = () => { if (state.recipeUndo !== null) {
        const previous = state.recipeUndo;
        $('codeEditor').value = previous.code;
        state.selected = previous.selected;
        $('optimizerSelect').value = previous.selected;
        clearRecipeUndo();
        invalidate();
        updateCodeLabel();
        toast('適用前のコードに戻しました。');
    } };
    $('benchmarkButton').onclick = benchmark;
    $('challengeNav').onclick = () => $('challengeSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('labNav').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    $('shareButton').onclick = showShare;
    $('closeShare').onclick = () => $('shareDialog').close();
    $('publishButton').onclick = publish;
    $('copyShare').onclick = async () => { try {
        await navigator.clipboard.writeText($('shareURL').value);
        toast('共有URLをコピーしました。');
    }
    catch {
        $('shareURL').select();
        toast('URLを選択しました。手動でコピーしてください。');
    } };
    $('manageButton').onclick = () => { $('deleteKeyInput').value = ''; $('deleteMessage').textContent = ''; $('deleteDialog').showModal(); };
    $('closeDelete').onclick = () => $('deleteDialog').close();
    $('confirmDelete').onclick = deletePost;
    $('guideButton').onclick = () => help();
    $('apiButton').onclick = () => help('api');
    $('privacyButton').onclick = () => help('privacy');
    $('scoreHelp').onclick = () => help('score');
    $('closeHelp').onclick = () => $('helpDialog').close();
    $('downloadCSV').onclick = () => { if (!state.runs.length) {
        toast('先に実験を実行してください。');
        return;
    } const rows = [['method', 'step', 'x', 'y', 'loss', 'best', 'departure_gradient_x', 'departure_gradient_y', 'point_gradient_x', 'point_gradient_y', 'update_x', 'update_y', 'oracle_calls']]; for (const r of state.runs)
        for (const h of r.result.history)
            rows.push([r.name, h.t, ...h.point, h.loss, h.best, ...h.gradient, ...(h.gradientAtPoint || ['', '']), ...h.update, h.calls]); const content = toCSV(rows); const url = URL.createObjectURL(new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'optimizer-run.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
    document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !state.computing) {
        e.preventDefault();
        runExperiment();
    } });
    new ResizeObserver(() => redraw()).observe(document.querySelector('.workspace'));
    function tick(now) { if (state.playing && state.runs.length) {
        const elapsed = Math.min(200, now - (frameLast || now));
        frameAccum += elapsed / 1000 * Number($('playbackSpeed').value);
        if (frameAccum >= 1) {
            state.step = Math.min(state.maxStep, state.step + Math.floor(frameAccum));
            frameAccum %= 1;
            if (state.step >= state.maxStep) {
                state.playing = false;
                setPhase('complete');
            }
            updateReadouts();
            needsDraw = true;
        }
    } frameLast = now; if (needsDraw && state.terrain) {
        needsDraw = false;
        try {
            const previous = $('showPreviousPath').checked && state.runs.length ? state.quickComparison?.history : null;
            plot.draw(state.terrain, state.terrainDef, state.start, state.runs, state.step, state.focus, $('showField').checked, previous, state.tool === 'inspect');
            drawLoss($('lossCanvas'), state.runs, state.step, state.focus, $('chartAxis').value, previous);
            drawSignal($('signalCanvas'), state.runs[state.focus], state.step, Number($('signalAxis').value));
        }
        catch (e) {
            notify('描画を更新できません: ' + e.message, true);
        }
    } requestAnimationFrame(tick); }
    $('startX').value = state.start[0];
    $('startY').value = state.start[1];
    loadOptimizer('momentum');
    updateTerrain();
    updateReadouts();
    updateQuickUI();
    requestAnimationFrame(tick);
    if (location.protocol !== 'file:' && !globalThis.__OPTIMIZER_WORKER__) {
        fetch('./api/status').then(r => r.ok ? r.json() : null).then(s => state.sharing = s?.sharing === true).catch(() => state.sharing = false);
        loadShared();
    }
}
startApp();
