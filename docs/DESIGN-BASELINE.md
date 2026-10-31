# Design Baseline — Optimizer Playground

> Status: design baseline for public repository iteration (2026-10-28).  This is not a production-readiness declaration.

## Mission

Make optimization algorithms accessible as **experiments people can play with, inspect, modify and share**. The purpose is not only an educational visualization or a leaderboard: it is to create the conditions for users to generate new algorithmic ideas and test them reproducibly.

## Confirmed product choices

- **Public website, no account required.** The app must be usable without login.
- **Browser-first computing.** Simulations run using the user's browser CPU. The current prototype does not implement WebGPU.
- **Simulation first.** The initial target is optimizer behavior over synthetic mathematical loss landscapes, not training neural networks on datasets.
- **Code and visual editing together.** The code implementation is authoritative. Visual editing should help explain and generate supported computations, not cap all future optimizers to a fixed menu of operations.
- **Two complementary synchronized analyses.** Spatial trajectories on contour/landscape views, and stock-chart-like time series of loss, gradient, updates and user-selected internal state.
- **Open exploration.** Presets and friendly controls for beginners; user-defined update rules for advanced users. Scores must never become the only way to explore.
- **Shared challenges.** Fixed terrain/initial-condition/budget configurations support side-by-side experiments. Evaluate ability to generalize across multiple conditions.
- **No personal cloud drafts.** Local in-browser experiments remain unposted unless the user explicitly opts in.
- **Explicit publication only.** Each published experiment gets a shareable URL and a deletion secret; do not publish automatically, do not provide a public directory or automatically execute someone else's code when opening a share link.
- **Public source repository now, service deployment later.** After design and implementation tuning, hand off to ChatGPT Work/Sites for publication. This repository is not a live service.

## Distinguish goal, current capability and later work

| Topic | Vision | v0.2.0 implementation | Later investigation |
|---|---|---|---|
| Optimizer expressions | Broad freedom for novel optimizers | Restricted JavaScript-like interpreted code; custom state, loops, arrays, multiple objective evaluations | More language/runtime support without promising arbitrary Python/CUDA execution |
| Terrain input | Formula, hand-drawn or predefined landscapes | Seven presets, formula editor and Gaussian brush on 2D terrain | More landscape and matrix-valued test classes |
| Computation | User's CPU/GPU in browser | CPU/JS Number (approximately FP64) | WebGPU subject to browser support and benchmark parity |
| Visual editing | Inspect and modify optimizer structure | Composable controls generate code | General node graph, with non-convertible code retained |
| Observation | Explain decisions and cost | Spatial traces, timeline, user-defined traces, update/gradient arrows | Better matrix-state/SVD visualization and cost profiling |
| Competition | Encourage discoveries, avoid overfitting | Nine-case local challenge with self-reported results | Reproducible cross-device measurement, independent validation, opt-in leaderboards |
| Sharing | Consent-based link sharing and deletion | Node server with file storage, deletion key | Production-grade persistence, abuse handling, origin/security checks |
| Neural network learning | Optional science validation | Not implemented | Small separate experiments only after simulator is useful |

## UX entry path

1. Visit a landscape and see an optimizer moving immediately after an intentional play action.
2. Change one input (initial point, landscape, coefficient or update rule).
3. Compare the two trajectories with the same replay timeline and the same evaluation budget.
4. Inspect *why* the direction changed: raw gradient, historical state, update direction, and loss evolution.
5. Run a cross-landscape challenge only when desired.
6. Share the experiment with a link after reviewing what will be posted.

## Scientific and scoring guardrails

1. Label results as **self-run/unverified**, not an official record.
2. Compare under fixed terrain definitions, start points, random seeds and evaluation budgets. Distinguish objective calls, gradient calls, update steps and elapsed wall time; they are not interchangeable.
3. Never infer performance in actual machine-learning training solely from synthetic 2D terrain scores.
4. Unseen evaluation cases are needed before a public competitive leaderboard can support generalization claims.
5. Record browser, hardware and numerical runtime assumptions; there is no reproducible cross-device wall-time ranking in v0.2.0.
6. Preserve interesting failures and unusual paths, not only highest scores.

## Security and privacy boundaries

1. Opened share links do not automatically execute shared code.
2. The current restricted interpreter is not a formally verified sandbox. Review and test it again before hosting a public code-sharing site.
3. Simulations do not upload themselves; the user must choose the publish action.
4. A share URL is publicly forwardable. A deletion secret must not be rendered in public share pages or stored in the source repository.
5. Publishing a GitHub repository is different from deploying a service. Never commit live `.env`, posted data, deletion keys or credentials.

## Definition of the next milestone

A first-time visitor can alter a custom optimizer, simulate it on a terrain, see spatial and temporal consequences, compare a built-in baseline, and choose to share—without account creation. All visible claims of performance include their evaluation conditions and self-reported status. The site remains local until deployment has been separately approved.

## Open decisions

- Source license decided: MIT as of 2026-10-31; ensure third-party notices remain intact.
- The minimum interoperable optimizer API for gradient-free, higher-order, and matrix methods.
- Future GPU backend and equivalence/testing strategy.
- Scoring transparency and unknown-task generalization checks.
- Whether/when to add opt-in scoreboards or collaborative forks.
- Production storage, abuse handling and public service operations in the eventual Sites hosting environment.
