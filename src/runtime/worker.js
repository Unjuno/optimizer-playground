import { simulate } from '../core/engine.js';
self.onmessage = event => {
    const { id, jobs } = event.data || {};
    if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > 20) {
        self.postMessage({ id, type: 'error', message: '実行ジョブの数が不正です。' });
        return;
    }
    try {
        for (let index = 0; index < jobs.length; index++) {
            const job = jobs[index];
            const result = simulate(job.config, job.code);
            self.postMessage({ id, type: 'result', index, result });
        }
        self.postMessage({ id, type: 'done' });
    }
    catch (error) {
        self.postMessage({ id, type: 'error', message: String(error.message || error).slice(0, 500) });
    }
};
