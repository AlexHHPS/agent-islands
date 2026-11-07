# Privacy and local data

Agent Islands has no application account or required hosted backend. It integrates with tools and websites that have their own data policies.

## Storage

| Location | Contents |
| --- | --- |
| `~/Library/Application Support/Agent Islands/projects.json` | Registered project directories |
| App support directory, profile/workspace configuration | Harness paths, configuration roots and workspace membership |
| App support directory, checkpoints | Last consultation and progress summaries |
| App support directory, `ai.json` | Optional endpoint, model and non-secret summary settings |
| macOS Keychain, service `Agent Islands AI` | Optional summary API keys, bound to exact endpoint |
| App support directory, `qa/` | QA SQLite records, auth, evidence, socket/service state and managed runtime data |
| Provider configuration roots | Provider-owned conversations and configuration, read for discovery/context |
| WKWebView local storage | UI preferences, drafts and checkpoint cache |

Project paths, prompts, summaries, screenshots and recordings can reveal confidential information. Authentication state can include cookies and tokens. Private app-owned directories and evidence files use restricted permissions where created by the service; the host account and its tools still have access.

## Network paths

- Installed agent harnesses contact their configured providers using their own credentials and permissions.
- The optional summary endpoint receives selected project/agent context and conversation excerpts when a summary is requested. Automatic refresh starts off. Redaction reduces common secret patterns but cannot guarantee removal of all sensitive text.
- Chromium visits the registered environments and their subresources. Those websites may collect data or load third parties.
- Preparing QA downloads a Playwright-managed Chromium browser. Building downloads npm dependencies and the pinned Node distribution.
- macOS dictation uses on-device recognition when supported; otherwise system speech behavior and permissions apply.
- The app has no configured analytics or telemetry endpoint. Third-party tools and visited sites have their own behavior.

## Sharing evidence

Preview screenshots in this repository use demonstration data. For your own reports, inspect images, URLs, HTML context, steps and video before sharing. Use test accounts. Never upload auth state, provider databases, local logs or a complete app support directory to a public issue.

## Cleanup

Quit the app before backing up or removing local state. Removing `~/Library/Application Support/Agent Islands/` clears app-owned configuration and QA data, but does not remove provider-owned conversations. Delete summary credentials separately in macOS Keychain Access under `Agent Islands AI`; endpoint changes do not automatically delete earlier keys. Chromium download caches and WKWebView data may remain outside the app support directory and can be removed using the appropriate macOS or Playwright tools.

There is currently no automatic evidence retention policy. Manage local evidence explicitly. Deleting the app bundle alone does not delete its stored data or Keychain entries.
