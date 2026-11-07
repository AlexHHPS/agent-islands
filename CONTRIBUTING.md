# Contributing to Agent Islands

Thank you for helping improve Agent Islands. Bug reports, documentation, accessibility work, provider compatibility checks and small fixes are welcome. You can participate in English or Spanish. The app is a macOS developer preview; start with the [development guide](docs/DEVELOPMENT.md).

## Find the right place

| You want to… | Start here |
| --- | --- |
| Ask a question or discuss an idea | [Discussions](https://github.com/AlexHHPS/agent-islands/discussions) |
| Report reproducible broken behavior | [Bug report](https://github.com/AlexHHPS/agent-islands/issues/new?template=bug_report.yml) |
| Propose a product change | [Feature request](https://github.com/AlexHHPS/agent-islands/issues/new?template=feature_request.yml) |
| Improve instructions or examples | [Documentation issue](https://github.com/AlexHHPS/agent-islands/issues/new?template=documentation.yml), or a small PR |
| Report a vulnerability | [Security policy](SECURITY.md); use a private report |
| Make your first contribution | Issues labeled [good first issue](https://github.com/AlexHHPS/agent-islands/labels/good%20first%20issue) or [help wanted](https://github.com/AlexHHPS/agent-islands/labels/help%20wanted), when available |

Search existing issues and discussions first. For a substantial feature, architecture change or new dependency, describe the problem and proposed scope before investing in an implementation. Small corrections and focused bug fixes can go straight to a PR.

## Set up a working copy

Fork the repository, clone your fork and create a topic branch from the current `main`:

```bash
git clone https://github.com/YOUR_USERNAME/agent-islands.git
cd agent-islands
git remote add upstream https://github.com/AlexHHPS/agent-islands.git
git switch -c fix/describe-the-problem
npm ci
npx playwright install chromium
npm run check
npm run build
```

Replace `YOUR_USERNAME` with your GitHub account. You need macOS 14+, Xcode Command Line Tools, Node.js 24.22.2, npm and Python 3. No provider account is needed for fixture tests. Authenticate a CLI separately only when manually checking a real harness integration.

Use branch names such as `fix/session-restore`, `feat/profile-picker` or `docs/qa-guide`. Keep a PR focused on one outcome. Avoid unrelated formatting, generated files and lockfile churn.

## Make a change

- Match the surrounding style. Use UTF-8, LF, a final newline and the repository's `.editorconfig`; preserve upstream vendor formatting.
- Use the existing UI tokens and text/icon state labels. Keep keyboard focus, contrast and reduced motion working. Include sanitized before/after screenshots for visual changes.
- Keep provider formats behind adapters and distinguish empty, stale, unknown and unavailable data.
- Preserve profile roots, running sessions' workspace scope and unsent drafts.
- Derive goal states from evidence. Token usage is not completion; a quiet terminal is not independently a blocker.
- Make context sent to external summary services an explicit user choice. Never introduce a private endpoint, account or machine path as a default.
- Do not rewrite project test configuration to skip its setup or access rules.
- Prefer platform capabilities and existing dependencies. Explain the need and license for a new dependency or imported asset.
- Add a regression test when changing behavior. Test the user's outcome rather than restating the implementation. Pure copy corrections do not need new tests.

AI-assisted contributions follow the same rules: review and understand what you submit, check its sources and licenses, and verify the result. Do not include private prompts or fabricated test results.

## Validate the result

Run checks appropriate to the change:

| Change | Validation |
| --- | --- |
| Documentation, policy or templates | `npm run check`, `npm run check:source`, `npm run check:secrets`; inspect changed links and YAML |
| UI behavior | Relevant UI tests; the full `npm test` suite if the bridge or shared state changes; sanitized visual proof |
| Native code, harnesses or cross-layer behavior | `npm run build`, `npm test`, `npm run test:native` |
| QA/browser service | Relevant real Chromium fixture tests; full suite for ownership/auth/transport changes |
| Dependencies or packaged assets | Lockfile, integrity/license review, `npm audit`, build and relevant tests |

The full verification commands are in [development](docs/DEVELOPMENT.md). Build before the complete suite. The native GUI smoke test requires a logged-in Mac; hosted CI runs the non-GUI self-tests. If a check cannot run on your hardware, say which one and why. Do not describe an unrun check as passing.

Never commit `.env` files, credentials, provider databases, local logs, browser authentication, generated evidence, `.atelier`, `build`, `dist` or `node_modules`. Use fixture data in screenshots and reports. The source and secret checks supplement your review; they do not replace it.

## Open a pull request

1. Update your branch from upstream `main` and resolve conflicts locally.
2. Use a title that names the result, such as `Fix restored conversations losing their directory`. Conventional prefixes (`fix:`, `feat:`, `docs:`) are welcome but not required.
3. Explain the problem, resulting behavior, relevant validation and material limits using the PR template. Link an issue when one exists.
4. Update documentation and the Unreleased changelog for user-visible behavior changes. A typo fix does not need a changelog entry.
5. Open as a draft if work remains; mark ready when it can be reviewed.

Changes enter `main` through a PR. The `macos` CI check must pass and review conversations must be resolved before merging. A maintainer decides whether the change fits the project, reviews risk and validation, and chooses the merge strategy. CODEOWNERS identifies the current maintainer; it does not guarantee a response time. See [governance](GOVERNANCE.md).

Respond to review with context and keep discussions about the change. Maintainers may request a smaller scope, ask for evidence or close a proposal with an explanation. Open a discussion before reviving a declined approach without new information.

## Report a bug well

Include macOS version, CPU architecture, app version, CLI versions, expected behavior, actual behavior and minimal reproduction steps. A small fixture project is better than a full private checkout. Review attachments for usernames, local paths, credentials, cookies, customer information and private conversation content. Security reports use the private channel in [SECURITY.md](SECURITY.md).

## License and conduct

Contribute only code and assets you have the right to share. Your contributions to project code are licensed under [Apache 2.0](LICENSE). Keep original third-party license notices and document their origin in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Unless you explicitly state otherwise, contributions intentionally submitted for inclusion are provided under Apache 2.0, including its contribution and patent terms. No separate CLA or sign-off is required.

Follow the [code of conduct](CODE_OF_CONDUCT.md) in issues, reviews and discussions. For questions about using the app, see [support](SUPPORT.md).
