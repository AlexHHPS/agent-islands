# Architecture

Agent Islands is a native macOS app with a bundled web interface. It runs without a hosted app backend.

## Source map

| Path | Responsibility |
| --- | --- |
| `native/main.swift` | App lifecycle, bridge routing, process sessions and snapshots |
| `native/pty.c` | PTY helper for interactive CLI processes |
| `native/Conversations.swift` | Provider conversation discovery and restore arguments |
| `native/AgentState.swift` | Evidence-driven state transitions and goal aliases |
| `native/ProjectWorkspaces.swift` | Named workspaces, captured roots and context scope |
| `native/Intelligence.swift` | Selected context, optional summaries and redaction |
| `native/AIConfiguration.swift` | Validated endpoints and native Keychain settings |
| `native/Operations.swift` | Profiles, QA operations and service lifecycle |
| `native/QAClient.swift` | Persistent stdio broker and correlated replies |
| `native/Browser.swift` | Browser sessions and delivery of visual references |
| `native/Workspace.swift` | Project files and filesystem helpers |
| `qa/service.mjs` | SQLite records, profile auth, recipes, suites, leases and MCP |
| `qa/browser.mjs` | Chromium control, captures, recordings and reference files |
| `ui/` | Plain JS/CSS, xterm terminals and SVG island scenes |
| `tests/` | Fixture-based native, PTY, UI and browser integration checks |

## Native bridge and processes

WKWebView loads local assets and sends structured messages to Swift. Swift owns local process execution, file access and credential handling. The PTY helper preserves interactive terminal behavior; xterm renders the output. Agent Islands wraps installed CLI harnesses rather than implementing their inference or permission engines.

Provider configuration directories are separate per profile. Conversation readers inspect local provider files and databases without rewriting their content. These are compatibility adapters over evolving formats, not guaranteed stable provider APIs. Unknown or unavailable data should remain distinguishable from an empty result.

## State engine

The native reducer interprets structured harness events and goal records. The UI renders normalized states with text, icons and color. Goal aliases include `stalled → blocked`, `in_progress → active` and `achieved → complete`. Stale evidence must not overwrite newer events. A bell, a quiet terminal or a large token count does not independently establish a blocker or completion.

Observed external sessions can have less reliable state than managed PTY sessions. The UI preserves that distinction. A token budget is consumption information, not an estimate of completed product work.

## Workspaces

A workspace contains project IDs and a primary project. Launching an agent captures the selected roots in its session arguments. Changing the active workspace affects visible context, not the captured roots of running processes. Additional project access follows the harness's capabilities. This scope is not an OS sandbox.

## QA transport

The app packages a pinned Node runtime and Playwright dependencies. A persistent stdio broker forwards correlated requests to a service through a private Unix socket. The broker has an idle lifetime; it avoids spawning a fresh Node process for each frame request.

The QA service stores records in SQLite and manages isolated browser contexts. Authentication is separated by profile, environment and test account. Runs carry their own environment, ownership, revision evidence and result. Browser sessions are tied to their owner; references from another owner are rejected.

## Visual references

The controlled browser streams frames into the web UI. Component selection combines a rendered crop with element context; region selection captures coordinates and image evidence. Recordings include video, sampled frames and interaction steps. Explicit sending resolves these into a local manifest and asset paths for the selected harness. Model support for the attached material varies.

## Optional inference

Summary generation is configured independently of the agent harness. Selected context is sent to a user-configured Chat Completions-compatible endpoint. HTTP is limited to loopback; keys are stored in Keychain under an endpoint-derived account. The web UI receives non-secret settings only. Automatic refresh starts disabled. See [privacy](PRIVACY.md).
