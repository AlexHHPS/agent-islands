# Security policy

Agent Islands runs local agent processes, reads conversation metadata and operates authenticated browsers. Treat the app's data directory and evidence as private.

## Reporting

Do not open a public issue containing a vulnerability exploit, credentials, browser auth state, provider databases or private prompts. Use [GitHub private vulnerability reporting](https://github.com/AlexHHPS/agent-islands/security/advisories/new), under **Security → Report a vulnerability**. If that channel is unavailable, contact a maintainer through a private channel explicitly listed on their profile. This source tree does not define a monitored security mailbox or promise a response time.

Include the affected version, impact, a minimal reproduction using fixture data, and any proposed fix. Coordinate disclosure privately until a fix and release are available.

## Supported versions

The current development version receives fixes. Older preview versions have no separate support guarantee. Update to the latest reviewed source before reporting an issue.

## Boundaries

- Workspace directories organize context; they are not a process sandbox.
- Harness permissions and any explicit bypass option still apply.
- Project Playwright suites run project code. Test only trusted checkouts.
- QA profile authentication is local and scoped, but evidence may contain sensitive page content.
- HTTP summary endpoints are restricted to loopback; HTTPS endpoints receive selected context when a summary is requested.
- Local app builds are ad hoc signed and are not notarized distribution artifacts.

See [privacy](docs/PRIVACY.md) for data locations. Dependency versions, runtime checksums and CI action commits are pinned; review updates and run checks before publishing a release.
