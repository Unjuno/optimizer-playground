# Linked Inspection v0.4.0 — Implementation Plan

**Goal:** Make each optimization step scientifically interpretable across spatial and time-series charts without changing score or optimizer execution.

**Architecture:** Keep the existing browser VM and 2-D terrain. Record gradients at both the departure point and the displayed position; use a small pure geometry module to select a trajectory step, then synchronize the existing timeline and inspector. Provide optional visual explanations of gradient, moving average and actual update.

**Constraints:** No login, no external assets, browser CPU/FP64, no automatic code execution on share links, opt-in publishing, no deployment. Preserve legacy history.gradient meaning for existing shares and user code. Keep learning score/benchmark definitions unchanged.

**Tasks:**
1. Write failing unit test demonstrating gradient associated with current position must be stored as `gradientAtPoint` and legacy `gradient` kept as departure-gradient; fix engine and sharing schema. Prove existing tests still pass.
2. Write failing unit tests for nearest trajectory selection (bounding coordinates, radius cutoff, duplicate at start, focus priority, empty/malformed points) and time-series step selection (clamped edges, no data); implement `src/ui/inspection.js`.
3. Add test for map inspector and time-series chart interaction (including mobile); implement `軌跡を調べる` map mode, click-to-focus/step, signal-chart step click, and inspector gradients/readout numbers. Ensure drawing tools remain intact.
4. Update documentation, add accessibility affordances, build and run all automated/browser tests. Produce versioned portable HTML and ZIP with sources. Do not publish or deploy.

**Review focus:** Preserve tool start-point placement and brush; avoid selecting off-trajectory clicks; honor per-run history length; ensure changed user code invalidates old experiment; ensure shared schema remains parseable for old records.
