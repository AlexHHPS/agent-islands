# Contributing to Agent Islands

Small, reviewable changes with a reproducible result are welcome. The project is a macOS developer preview; see [development](docs/DEVELOPMENT.md) before changing native or browser integrations.

## Start here

1. Check existing issues once the repository is published. Describe a substantial change before implementing it.
2. Fork the repository and create a topic branch.
3. Install dependencies with `npm ci`, install Playwright Chromium and build the app.
4. Make the change, run the relevant checks and describe the result in a pull request.

Documentation changes need link and source checks. Native, harness or browser behavior needs the corresponding fixture tests. Run the complete suite before changes that cross the native bridge.

## Report a bug

Include macOS version, CPU architecture, app version, harness version, expected behavior and steps to reproduce. Prefer a minimal project and demonstration data. Remove usernames, local paths, tokens, prompts, cookies and customer information from attachments. Never upload provider databases or app authentication state. Security reports follow [SECURITY.md](SECURITY.md).

## Working conventions

- Keep app behavior local by default. Make network-bound summary generation an explicit configuration choice.
- Preserve separate profile roots and the workspace captured by a running session.
- Derive agent states from evidence; do not infer completion from a token budget or mark a silent terminal as blocked.
- Preserve drafts and make sending to the harness an explicit action.
- Use the existing tokens and accessible state labels. Include sanitized screenshots for visual changes.
- Keep provider formats behind adapters; handle missing, stale and unavailable data distinctly.
- Never rewrite a project's test configuration to bypass its setup or access controls.
- Avoid new dependencies when platform capabilities suffice. Keep lockfiles and original licenses.

Use descriptive commits. A PR should explain the user-visible problem, resulting behavior, validation and material limits. Tests should cover behavior, not duplicate implementation details.

## Licensing and conduct

By submitting a contribution, you agree to license it under the project's MIT License. Keep third-party notices intact and identify the origin and license of any imported asset or code. No separate contributor agreement is required. Follow the [code of conduct](CODE_OF_CONDUCT.md).
