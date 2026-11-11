# Changelog

Changes are grouped by user-visible behavior. Versions before public distribution were local previews.

## 0.13.0 — Unreleased

- Give work panels the full canvas when a conversation is open or an expanded pulse has information. Remove the decorative island from that view and let panel content scroll without the old height cap.
- Open public web addresses with their full path, query and fragment; keep local frontend discovery as a secondary option.
- Bring a selected tab from an SSO window or a locally connected Chromium into the visual browser. Retain its live session, support captures and recordings, and detach without closing the original tab.
- Add persistent terminal pins to the mosaic, ordered before other terminals and isolated by conversation/profile/project identity.
- Update the private QA protocol to version 6 for tab discovery and attachment.

## 0.12.0 — Initial multilingual version

- Add Spanish and English across the UI, native menus/dialogues, permission descriptions, browser/QA messages and generated agent guidance.
- Add a persistent language selector under Help/settings that updates the UI without restarting agent sessions or discarding drafts and forms.
- Share catalogues between JavaScript, Swift and Node, validate keys and interpolation placeholders, and generate the offline UI bundle.
- Follow the selected language for dates, numbers, dictation, speech and optional summaries. Preserve user content, provider output and recorded evidence.
- Isolate QA request locales across concurrent operations and update the private service protocol to version 4.
- Keep accented and other multibyte text intact in QA requests, responses and suite reports.
- Keep the QA connection alive when too many requests are pending, release browser and login windows that crash or are closed by hand, and stop the QA service cleanly when asked twice.
- Stop a workspace-scoped agent from replacing a journey that belongs to another workspace.
- Keep the agent state when a harness reports a very long final message, and clear leftover hook events at launch.
- Keep the 100 most recent closed sessions in the app registry; older conversations remain available from the provider history.
- Write session records only when they change, preserve file permissions when saving from the editor, and keep workspaces consistent after removing a project.
- Disallow inline scripts in the bundled interface.
- Open a local frontend in one click: loopback dev servers and the project's dev-script port are detected, or paste an address.
- Stream the controlled browser live; switch between desktop, laptop, tablet and mobile widths and pause animations.
- Annotate elements, several elements, text or areas with numbered pins, intent and priority.
- Annotations carry component chains and source `file:line` for React 18/19, Svelte, Vue and Angular, plus computed styles, accessibility and recent page errors.
- Try colour, size and spacing changes live on the page and send them for the agent to persist.
- Agents can list, watch, acknowledge, resolve, dismiss, reply to and propose annotations through MCP. Resolving re-captures the element for a before/after comparison and records the files changed in git.
- Add timestamped notes during recordings.
- Resize the terminal beside the browser. The browser steps aside for the terminal deck or the expanded terminal.
- Keep text drafts across restarts, and keep text typed while a prompt was being rejected.
- Delete visual evidence and annotations after 30 days; `AGENT_ISLANDS_RETENTION_DAYS` changes the window. The private QA protocol is now version 5.

## 0.11.0 — Initial public source

- Adopt Apache-2.0 for the current revision, retain third-party notices and acknowledge permissions granted on earlier MIT revisions. Commercial contact is an optional invitation, not a license restriction.

- Prepare the source tree for sharing under Apache-2.0, with contribution, security, privacy, architecture and release documentation.
- Establish contribution/review conventions, code ownership, community support and governance, issue/PR templates and categorized release notes.
- Add an original project identity and a visual README with sanitized app fixtures.
- Replace machine-specific summary configuration with optional endpoint/model settings and endpoint-scoped macOS Keychain credentials. Automatic summaries start off.
- Remove private project adapters, instruction-mutating scripts and local research output from the shared source.
- Preserve project Playwright configuration and expose explicit QA environment variables for integration.
- Canonicalize bundled UI paths for launches through macOS temporary-directory aliases.
- Pin the bundled Node runtime and checksums, build for the host Mac architecture, and add source and CI checks.

## 0.10.0 — Local preview

- Unify evidence-driven goal states across native and UI layers, including stalled, in-progress and achieved aliases.
- Retain a persistent native QA broker with correlated requests and bounded idle lifetime.
- Add local browser engine evaluation scripts using synthetic fixtures.

## 0.9.0 — Local preview

- Add component and region captures and browser flow recordings as reviewable chat references.
- Deliver visual reference manifests and assets to the selected CLI harness.

## 0.8.0 — Local preview

- Add named workspaces with several projects, a primary root and context scoped to the active workspace.

## Earlier local previews

- Establish the native app, real agent terminals, conversation recovery, profiles, checkpoints and deployed-environment QA.
