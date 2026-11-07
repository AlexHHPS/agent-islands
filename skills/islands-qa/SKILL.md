---
name: islands-qa
description: Check user journeys against registered deployed environments through Agent Islands QA, with isolated browser sessions, profile-specific authentication and linked evidence. Use for deployed browser QA or recovering its access, not for ordinary unit tests.
---

# Agent Islands QA

Use the `islands-qa` MCP tools when available. They share the app's environments, recipes and run history. The MCP connection is bound to the profile that launched it; do not switch credentials or borrow another profile's saved access.

Start with `islands_snapshot` to discover the registered environment and journey. If it is missing, describe the missing registration; the app's **QA y perfiles → Entornos** can register it. Do not guess a deployment URL, tenant or account.

For an existing journey call `islands_run_start` with `environmentId`, `recipeId`, and the relevant task's `agentId` or `threadId` when known. For an existing project suite use `suite: {config: "relative/path/playwright.config.ts", grep: "optional case filter"}`. Configs must remain inside the registered project. Suites can opt into the selected profile's saved authentication by reading AGENT_ISLANDS_QA_STORAGE_STATE in their Playwright configuration; the app does not rewrite project setup hooks.

If access is missing, `islands_login_open` opens a visible browser. The user completes the identity provider's login, then `islands_login_save` stores this profile's state after checking the configured authenticated element. `islands_auth_check` verifies it before reuse. Do not claim headless automation can bypass SSO or MFA.

Retrieve completion using `islands_run_get`; use bounded polling, and `islands_run_cancel` when cancelled. Failed or blocked runs can be retried with `islands_run_retry` after addressing the cause. Do not retry product failures indefinitely or change the requested acceptance criteria to get a pass.

Keep these outcomes distinct: `passed`, `failed`, `blocked`, `skipped`, `cancelled`, `interrupted`, and `stale`. All skipped is not a pass. `revisionVerified=false` means the journey was checked but the deployed revision is unverified. A changed revision invalidates version-specific acceptance.

Summarize what a user can now do, key product changes, and what remains unvalidated. Reference the run ID and its screenshots/result. Describe implemented, locally checked, deployed and validated separately. QA tools do not authorize deployments or pushes; preserve the user's existing permissions, including explicit consent for direct pushes to main/staging.
