# Browser alternatives: evaluation scope

Chromium remains the production test/browser engine. The system WKWebView remains the desktop UI renderer. The scripts in this repository support local fixture research; optional engines are not bundled or required to build the app.

| Candidate | Potential role | What must be established before adoption |
| --- | --- | --- |
| Lightpanda | Background DOM extraction and automation without graphical rendering | DOM/API compatibility, process-per-profile isolation, correctness on representative apps and license obligations. It cannot substitute for rendered visual evidence. |
| Ultralight | Embedded HTML renderer | A measured benefit over the existing system WKWebView, SDK/license suitability and the cost of migrating native integration. |
| Agent Browser | Agent-oriented browser control, sessions and observation | Stable ownership/auth boundaries, streaming backpressure, capture fidelity and whether an adapter reduces transport cost. |
| Stagehand | Optional semantic recovery or extraction around deterministic tests | Representative page-change tests, model/data policy, cost and an explicit boundary between deterministic assertions and model guesses. |

No broad speed claim follows from a local synthetic benchmark. Startup, warm operation latency, memory, fidelity, authentication and real deployed latency must be measured separately. RSS can double-count shared memory. Semantic recovery needs an actual model and representative failures; a deterministic replay test does not establish it.

## Reproduce the baseline

After building the app and installing Playwright Chromium:

```bash
node scripts/benchmark-browser.mjs
```

The benchmark uses a local HTTP fixture and writes ignored output under `build/browser-research/`. It can compare optional verified binaries placed there; it does not download them or authenticate against real environments.

`node scripts/investigate-browsers.mjs` is an advanced optional probe. It expects reviewed release binaries and their `*-release.json` metadata with a `digest` field of `sha256:<hex>`. The Stagehand probe expects a separate installation under `build/browser-research/stagehand/`. Review the script and upstream license before preparing those optional tools. Missing tools are reported rather than treated as production support.

Do not commit raw machine reports, browser state, optional engine binaries or recordings. Publish a sanitized report with versions, hardware, methodology and limitations if proposing an integration.
