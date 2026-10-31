# Browser Optimizer Playground Implementation Plan

> **For agentic workers:** execute with superpowers:executing-plans task by task.

**Goal:** Deliver a runnable, browser-only optimizer playground with editable code/visual recipes, terrain editing, linked diagnostics, repeatable challenges and opt-in share/delete.

**Architecture:** Dependency-light ES modules, Canvas visualization, a metered JavaScript-subset interpreter in a Web Worker, and a Node HTTP server with durable per-post files. No server computation; no private drafts; static/offline mode remains usable but server posts require the included server.

**Tech Stack:** JavaScript (FP64), vendored Acorn parser, Canvas 2D, Web Workers, Node >=22, Python Playwright for verification.

**Spec:** docs/reference/SPEC-v0.1.md plus the user's subsequent game, score and synchronized spatial/time-series requests.

## Global Constraints
- No login, no automatic private persistence, no automatic upload.
- Actual optimization rather than prerecorded trajectories.
- Algorithm code may have state, branching, loops, arrays/matrices and multiple oracle evaluations; it is not limited to seven operations/two states.
- Browser-only CPU implementation for this release; no fabricated GPU or neural-network benchmark claims.
- Third-party shared code is not auto-executed.
- Fixed challenge evaluation and exploratory results are distinguished.

## Review Focus
- Custom code infinite loops, forbidden host/prototype access, oversized allocations.
- Invalid formulas/nonfinite outputs and out-of-domain moves.
- Different initial conditions or stale code falsely compared as one experiment.
- Forged scores and edited logs remain labeled unverified; no official leaderboard.
- Share deletion and read operations cannot leak deletion keys or execute markup.

## Task 1: Numeric core and restricted runtime
Files: src/core/expression.js, terrains.js, optimizers.js, engine.js; src/runtime/interpreter.js; tests/core.test.mjs, runtime.test.mjs.
Interfaces: compileExpression(source) -> evaluator; makeTerrain(def) -> {value,gradient}; Interpreter.run(code,bindings), call(name,args); simulate(config,code) -> structured history/counts/result.
- [x] Write and run failing tests for gradients, reference steps, budget and sandbox behavior.
- [x] Implement modules and run all unit tests.
- [x] Commit numeric/runtime implementation.

## Task 2: Share API
Files: server/app.mjs, store.mjs, index.mjs; tests/server.test.mjs.
Interfaces: createServer({dataDir,publicDir}) -> Node server; POST/GET/DELETE /api/posts.
- [x] Write failing integration tests (opt-in, validation, key secrecy/deletion, limits).
- [x] Implement storage, schema validation, origin checks, CSP and rate limits.
- [x] Run suite; commit.

## Task 3: Interactive app
Files: public/index.html, style.css; src/ui/app.js, plots.js (recipe generation in src/core/optimizers.js); src/runtime/worker.js; scripts/build.mjs; tests/browser.py.
Interfaces: worker accepts run payload, returns validated result; browser renders and replays immutable results; structured recipes generate code only on explicit apply.
- [x] Write browser workflow checks and observe missing UI failures.
- [x] Implement editor/terrain/plot/challenge/share workflows, responsive layout and keyboard support.
- [x] Build offline single HTML and hosted assets; run browser checks and inspect screenshots.
- [x] Commit.

## Task 4: Delivery and verification
Files: README.md, docs/RUNTIME.md, SECURITY.md, docs/VERIFICATION.md, Dockerfile, .github/workflows/ci.yml.
- [x] Run full unit/API/browser suite and package checks.
- [x] Self-review boundaries; fix failures with regression tests.
- [x] Create source zip, ready-to-run zip and portable HTML; explicitly record unverified/publication limitations.

Hosted browser E2E was blocked by environment policy; in-memory UI/Worker and Node HTTP tests were performed separately. See docs/VERIFICATION.md.
