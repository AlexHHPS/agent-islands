# Changelog

Changes are grouped by user-visible behavior. Versions before public distribution were local previews.

## 0.17.1 — Native macOS shell and terminal shutdown

- Close the PTY master before reaping the child and limit the wait after SIGKILL. This lets the helper exit even if macOS leaves its child stuck while exiting.

- Settings opens in its own window (General, Avisos, Integraciones, Inteligencia, Ayuda, Acerca de) with search-free sections, segmented controls and keyboard navigation. ⌘, focuses it if it is already open.
- Navigation can sit above the content as a toolbar (default) or as vertical tabs on the left or right. Islands in the vertical tabs show the marks of the agents working there and a dot for their most urgent state.
- Interface style: Clásico or Cristal. Cristal blurs the window and draws the content and inspector as separate glass panes; the pane in use stays clear.
- Accent colour: Sistema plus eight colours. Dark mode uses the bright tone with dark text; light mode uses a darker shade of the same hue that keeps white text at 4.5:1.
- Alerts per state (Te necesita, Error, Turno terminado) and channel (notification, Dock badge, sound). Unfocused terminal cards dim, and each card shows the reason it needs you.
- Icons come from Lucide only. Vendor marks are the owners' own isotypes in one colour, tinted from `ui/tokens.css`; the Codex symbol stays a LobeHub redrawing until OpenAI publishes one. See `assets/brands/NOTICE.md`.
- Window behaviour follows AppKit: the toolbar and sidebar head move the window, every edge and corner resizes it, the traffic lights sit centred in the 52px toolbar, interface text does not select, and WebKit's own right-click menu is gone outside fields.
- Menus behave like NSMenu: a press outside closes them, one is open at a time, choosing an item closes it, arrows move between items and they close when the window loses focus. The workspace picker is a pop-up button with checkable items.
- Fix Settings sections that could not scroll, inspector rows whose state label was pushed out of the panel, and dialogs that closed after a text selection was dragged out of a field.

### Terminal-first workspace

- Open directly in Terminales. Mundo pairs compact island cards with a wider team sidebar and consistent status labels.
- Pulso shows actionable local signals. Review opens the specific agent, and Continue sends one turn to an eligible terminal.
- Agent detail keeps the checkpoint beside the terminal and offers a refresh when newer activity or QA evidence is available.
- Agent launch and summary AI use visual selectors. Navigation, terminal filters, and checkpoint actions use identifiable icons with accessible labels. Secondary tools share compact menus.

## 0.17.0 — Unreleased

- Fix the interface becoming very slow while agents work. Page states that were written as `:has()` selectors (open dialogs, expanded pulse, checked choices) are now plain classes. WebKit re-checked those selectors against the whole page for every inserted element; with working agents each island frame inserted about 800 elements and took about 730 ms. The same frame now takes about 6 ms.
- Reorder island elements in place. A walking robot used to re-insert the whole scene on every frame (about 800 elements); now only the groups that changed place move (about 20). This is a local change to the vendored Diorama kernel; rendering is pixel-identical.
- Pace the island loop with a timer instead of a display-rate callback that skipped most frames.
- Make the GPU terminal renderer an opt-in trial (`localStorage.setItem('islands.gpuTerminals','1')`). Inside the native window it slowed page snapshots several times over and is not yet verified on real sessions, so terminals use the default renderer. When enabled, it is taken back after the display sleeps and the GPU context is lost.

## 0.16.0 — Unreleased

- Keep the interface light during long sessions. Islands animate at 24 frames a second from one shared loop and only while someone is using the window. After 20 seconds without pointer activity, or when the window cannot be seen, they hold their last frame and use no CPU; moving the pointer or an agent change wakes them. Measured in WebKit at full screen with six sessions, the world view goes from about 175% CPU at rest to 0%.
- Draw the island's shadow on the page as a static gradient. The previous blurred SVG filter was recalculated on every animated frame and took about 100 ms per frame.
- Vendor the xterm WebGL renderer 0.19.0 (pinned). Never installed as the default; see 0.17.0.
- Skip rewriting the team list, attention list, counts and island chips when a snapshot does not change them.
- Tell the interface when the native window becomes hidden or visible, so animation stops with the window.

## 0.15.0 — Unreleased

- Keep the interface responsive while agents produce heavy terminal output. Output reaches the interface as one update per session about 30 times a second instead of one message per read.
- Stop sending terminal output while the window cannot be seen (display asleep, minimised or covered). On return, each session that produced output is redrawn once from its saved history instead of replaying a backlog. Agents keep running throughout.
- Reload the interface automatically if its process ends, and redraw every terminal from history. Agent sessions are not interrupted.

## 0.14.0 — Unreleased

- Close a session from its inspector or terminal card, retire the terminal after confirmed termination, and return to the terminal mosaic. Cancellation preserves the session and current view.
- Count attention only for blocked/limited goals or confirmed pending questions/approvals. Ignore generic waiting/idle notifications, ordinary shell prompts and completed turns. Track current terminal screens without submitting provider input.
- Animate terminal status icons only during activity and respect reduced motion and document visibility.
- Increase general terminal-card height and add persistent named terminal views. One terminal fills the available workspace; two sit side by side; larger selections use a grid. Views preserve conversation identity and workspace boundaries.

## 0.13.0 — Work panels and browser reuse

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
