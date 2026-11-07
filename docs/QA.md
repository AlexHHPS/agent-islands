# Browser and QA guide

## Register an environment

Under **QA y perfiles → Entornos**, choose a project, name and origin. Add a health/sign-in path and a selector that proves access, such as `[data-testid=account-menu]`. Optionally configure a revision endpoint and expected deployment revision. Without revision evidence, the result must remain explicitly unverified.

Prepare Chromium from **Salud → Preparar QA**. The UI renderer remains WKWebView; this Chromium instance exists for controlled browsing and tests.

## Authenticate the correct account

Choose the harness profile, environment and test account under **Pruebas**. Open access, complete sign-in in the browser, then save it. Authentication is scoped to that combination; a personal profile does not inherit a work profile's saved browser state. Check access before a run. SSO/MFA can require human interaction.

## Capture a requested change

Open the controlled browser for the selected agent. Use component selection for element context plus a crop, region capture for a visual area, or recording for a flow. Add a concrete instruction in the draft and send it explicitly. References carry their owner and cannot be used by an unrelated agent.

Recordings are bounded; they are not an indefinite screen recorder. They capture the controlled browser, not your entire desktop. Video, sampled frames and step context help the harness inspect the flow; video understanding depends on the model and tools available to it.

## Recipes

Register a small journey using explicit selectors. A minimal example:

```json
[
  {"action": "navigate", "path": "/"},
  {"action": "expectVisible", "selector": "main"},
  {"action": "expectText", "selector": "h1", "value": "Dashboard"}
]
```

Read-mode recipes block mutating HTTP methods as a best-effort guard. Applications can mutate state through GET, WebSockets or other behavior; this is not a proof of immutability. Use isolated test accounts and safe environments. Write-mode flows require the appropriate test data and authorization.

## Existing Playwright suites

Register the project directory and point QA at its Playwright configuration. The configuration, global setup and hooks execute unchanged. Project suites are executable code and must be trusted.

The child receives these explicit integration variables:

| Variable | Meaning |
| --- | --- |
| `BASE_URL` | Registered environment origin |
| `AGENT_ISLANDS_QA_STORAGE_STATE` | Saved auth-state path, or empty if unavailable |
| `AGENT_ISLANDS_QA_PROFILE_DIR` | Scoped browser profile directory |
| `AGENT_ISLANDS_QA_EVIDENCE_DIR` | Evidence directory for this run |
| `AGENT_ISLANDS_QA_RUN` | Run identifier |

Opt into saved auth in your own configuration if appropriate:

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.BASE_URL,
    storageState: process.env.AGENT_ISLANDS_QA_STORAGE_STATE || undefined,
  },
});
```

This does not replace your project's setup or account-selection rules. A suite in which every case is skipped produces a skipped result, not a pass. Failed setup, absent access or changed revision must remain visible.

## Results and coordination

Inspect the run's checks, revision status and evidence. Failed means a check ran and failed; blocked means execution could not proceed; stale means the deployment changed relative to the recorded expectation. Cancellation and interruption are separate outcomes. Reserve shared environments before concurrent work; release only leases you own.

## MCP

The app supplies a profile- and workspace-scoped MCP connection to launched harnesses where supported. The service and app use the same records. The bundled [QA skill](../skills/islands-qa/SKILL.md) describes agent-side operation. Do not expose the local service on a public interface or copy another profile's auth directory.
