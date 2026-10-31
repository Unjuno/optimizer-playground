# Repository status — 2026-10-31

- **Repository:** https://github.com/Unjuno/optimizer-playground (public)
- **Baseline:** v0.4.0 browser-only optimizer simulation prototype
- **License:** MIT for project source, Acorn third-party MIT notice retained
- **Current simulation backend:** JavaScript Number (FP64), CPU, two-parameter landscapes
- **Implemented:** formula and drawing terrains, custom restricted-JS optimizer, built-ins, linked spatial/time-series plots, 9-case challenge, opt-in share API
- **Not implemented:** GPU, arbitrary Python/CUDA code, matrix-valued benchmark tasks, neural network training, verified cross-hardware leaderboard
- **Hosting:** not deployed; Work / Sites deployment is a separate later step

## Development validation

Run on a machine with Node.js >=22:

```bash
npm test
npm run build
```

Browser acceptance (Python/Playwright) is documented in [../README.md](../README.md) and [VERIFICATION.md](VERIFICATION.md). Re-run in CI on each push.

## Next priorities

1. Confirm CI green on the GitHub repository and check the browser share/delete flow in a deployment-like environment.
2. Audit safety properties of the restricted interpreter and public posting pipeline.
3. Improve accessible game-style onboarding without hiding full code customization.
4. Define a separate matrix-parameter benchmark suitable for orthogonalization-based optimizers such as Muon.
5. Keep the current scoring explicitly self-run/unverified; design anti-overfitting validation before adding public rankings.

Do not treat the present simulation scores as proof of superior deep-learning training performance.
