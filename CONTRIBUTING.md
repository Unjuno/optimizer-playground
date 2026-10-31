# Contributing and experiment reports

This repository is a public design and implementation baseline. Open an issue with a reproducible scenario before submitting major changes.

## Reporting an experiment

Provide the optimizer code or share URL, terrain/preset or expression, starting point, random seed, evaluation budget, browser/OS and the observed result. If a comparison includes timing, record CPU/GPU model, browser/runtime version, workload and measurement method. Distinguish measured facts from hypotheses.

## Before a change

- Read `docs/DESIGN-BASELINE.md` and `docs/ROADMAP.md`.
- Preserve explicit posting consent, no-login operation and the deletion-secret flow.
- Never commit `.env`, API tokens, saved posts, delete secrets or any personal data.
- Run `npm test` and `npm run build` for JavaScript changes; if available, run `npm run test:browser-offline` too.
- Include a regression test for changes in numerical results, the interpreter, score accounting or the share API.

## Public visibility and licensing

The repository is public but a project-level redistribution license has **not yet been selected**. Do not assume that public visibility grants permission to redistribute proprietary source elsewhere. Acorn is separately MIT licensed; consult `THIRD_PARTY_NOTICES.md`.
