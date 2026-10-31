# Roadmap — GitHub review before Sites deployment

**Current branch / release intent:** v0.4.0 prototype + design baseline. Do not treat this as a production-hosting release.

## Stage 0 — Public repository baseline (now)

- [x] Package a reproducible browser prototype and source code.
- [x] Include `npm test`, `npm run build`, and offline Chromium interaction tests.
- [x] Record product decisions, design scope, security boundaries and implementation gaps.
- [ ] Create GitHub `Unjuno/optimizer-playground` as **Public** (account UI operation required).
- [ ] Push this exact baseline and review GitHub's visible files.
- [ ] Choose license and contribution policy.

## Stage 1 — Playfulness and explanation

- [x] Add a visible first-run action with one-click local simulation.
- [x] Add β-only Momentum A/B comparison with a toggleable previous path and loss curve.
- [x] Keep the old comparison out of published snapshots and explain this in the share dialog.

- [ ] Validate the first-use flow with new testers who know no optimizer theory.
- [x] Make the spatial and time-series views mutually inspectable at the same simulation step (v0.4.0).
- [x] Show gradient / moving-average / actual-update components when published as metrics (v0.4.0).
- [ ] Add more advanced explanations without requiring every program to become a graph.
- [ ] Ensure arbitrary code remains readable when visual conversion is impossible.
- [ ] Record representative failure cases (oscillation, saddle points, divergence, stagnation).

## Stage 2 — Scientific evaluation and safety

- [x] Enforce the suite-v1 nine-case identity, seeds, reported averages and matching shared code in posted records (structural consistency only).
- [ ] Define future versioned protocols and stronger objective/gradient/update accounting.
- [ ] Separate benchmark score and qualitative exploration results.
- [ ] Add numerical regression tests across reference methods, seeds, boundaries and unusual states.
- [ ] Run a security review of the sandbox and the share-content rendering path.
- [ ] Decide moderation, rate limiting, retention, abuse reporting and storage ownership.

## Stage 3 — ChatGPT Work / Sites deployment (deferred by decision)

- [ ] Open the repository in ChatGPT Work; use Sites for the deployment workflow.
- [ ] Verify what runtime, server routes and persistent storage Sites actually supports. Do not assume Node process filesystem persistence.
- [ ] If needed, replace file-based share storage with a supported durable backend before public links are enabled.
- [ ] Test POST→shared URL→view→delete, incorrect key, rate limit, origin checks and expiration on an HTTPS staging address.
- [ ] Publish only after owner approves final domain, security boundaries and retention/abuse policy.

## Explicitly outside this baseline

- Automatic deployment or public site URL
- Real neural-network training / benchmark claims
- Universal Python, PyTorch or CUDA code execution
- Verified worldwide leaderboard or researcher-grade optimizer ranking
- Automatic posting or personal cloud storage
