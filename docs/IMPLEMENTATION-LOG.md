# Implementation log

Ruling: Build in a new isolated directory/feature branch; no existing repository modified.
Ruling: Browser runtime uses an explicitly documented, metered JavaScript subset interpreted from Acorn AST. External package downloads are unavailable in this environment. No host eval or user-code network APIs are exposed. This limits syntax/library compatibility, not optimizer families.
Ruling: CPU FP64 is the actual implemented backend. GPU and full NN training remain outside this initial release.
Ruling: Connected GitHub actions are read-only; no repository creation/push action is exposed. The deliverable will include a ready-to-publish source tree and exact deployment instructions.
Ruling: Public deployment is not claimed without a returned live deployment and access verification.

Task 1: Core/runtime implemented; 17/17 unit tests passed (numeric gradients, optimizers, arbitrary state, budgets, capability denials, recursion/allocation limits).
Task 2: Opt-in post storage, validation, explicit deletion key, TTL, origin/rate/body limits implemented; integrated test suite passed.

Task 3: Interactive app implemented; portable HTML tested with real Chromium/Worker. Custom code, terrain brush, expression editor, recipe generation/undo, synchronized plots, nine-case challenge and responsive layout verified.
Ruling: Managed Chromium blocks all URL navigation. Do not disable that policy. Test actual release HTML in memory; test actual HTTP APIs separately in Node. Hosted browser HTTP E2E remains explicitly unverified.
Ruling: Retain the complete bounded JS interpreter instead of host eval. Unsupported JS syntax and library compatibility remain documented.
Ruling: Keep project license UNLICENSED pending the owner's choice. Acorn's MIT license is included unchanged as a third-party license.
Final review: self-review (no subagent tool). Fixed publicOrigin conditional, target evaluation order, async/generator rejection, spread array bound, stale inspector label, benchmark serialization, failed-run scores and CSV formula injection.
Final: minor (deferred): broad JavaScript semantic compatibility (var hoisting/loop closure semantics/sparse arrays) remains outside the documented subset.
Final: minor (deferred): free-form graph roundtrip editing, desktop keyboard navigation across every canvas coordinate and dedicated mobile touch-device validation are not implemented/verified.
Task 4: Source, server, standalone release, documentation and test evidence prepared. Public GitHub push and hosting not performed.

2026-10-31: Public repository license decision supersedes the earlier UNLICENSED placeholder: MIT. Acorn license remains included separately.
