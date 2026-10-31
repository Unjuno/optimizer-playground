# Handoff to ChatGPT Work / Sites (later)

## Intent

Deployment is **deliberately deferred**. This repository is the source of truth for the prototype and design decisions; do not start deployment during the GitHub design-review phase.

## What exists now

- `release/Optimizer-Playground.html`: self-contained, static browser simulator, no share API.
- `public/`, `src/`, `scripts/`: source and build scripts.
- `dist/`: static output and Web Worker for the Node server.
- `server/`: Node 22 HTTP sharing API with expiring JSON-file storage.
- `tests/`: deterministic Node tests and offline Chromium tests.

## Potential Sites compatibility risk

The existing sharing server assumes a **long-running single Node.js process with a writable persistent disk**. If Sites supplies only static hosting or ephemeral serverless functions, the current `server/store.mjs` implementation cannot guarantee durable shared links. The intended backend must be reviewed and changed to match the supported hosting interface before publishing share/delete features.

The static simulator can be deployed independently, but that version **does not publish share URLs**. Do not silently replace opt-in server posting with URL-encoded state or browser storage: deletion and privacy semantics would change.

## Handoff checklist

1. Start ChatGPT Work and load the public `Unjuno/optimizer-playground` repository.
2. Read `docs/DESIGN-BASELINE.md`, `docs/ROADMAP.md`, `SECURITY.md`, and `docs/DEPLOYMENT.md`.
3. Confirm the product flow and final deployment capabilities with Sites; preserve no-login, no-automatic-posting, and deletion-key guarantees.
4. Run `npm test`, `npm run build`, and browser interaction tests on the final code revision.
5. Configure HTTPS origin, production storage, retention, abuse controls and monitoring before enabling public posts.
6. Independently test create/view/delete and anonymous user safety on the deployed URL.
7. Deploy only when the owner explicitly approves the final settings and domain.

## Known facts vs assumptions

- **Confirmed for this codebase:** Node 22 scripts; CPU-only simulation; local file-backed share API; explicit opt-in.
- **Not established:** Sites support for persistent Node filesystem, mutable backend APIs, production DB, WebGPU, domain configuration or specific build commands. Determine these in Work rather than guessing.
