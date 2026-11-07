# Project governance

Agent Islands is an independent, maintainer-led open-source project under the MIT License. The current maintainer is [@AlexHHPS](https://github.com/AlexHHPS); code ownership is recorded in [.github/CODEOWNERS](.github/CODEOWNERS).

## Decisions

Small fixes and documentation corrections can be proposed directly as pull requests. Discuss substantial product changes, architecture, provider integrations, data handling and dependencies in an issue or discussion first. Describe the user problem, alternatives, scope and evidence. An approved idea is not a promise of a delivery date.

Maintainers aim for decisions people can understand. The maintainer responsible for a change resolves disagreements after considering product fit, maintainability, accessibility, compatibility, privacy and validation. Record the decision and its reason in the relevant issue or PR. Revisit it when new evidence changes the tradeoff.

## Review and merging

`main` is the integration branch. Changes go through a PR with passing required CI and resolved review conversations. Maintainers review behavior and risks rather than relying only on a green check. CODEOWNERS routes ownership; the repository currently does not require an approval from a second maintainer, so a sole maintainer can maintain the project.

External contributions are reviewed by a maintainer before merging. The author remains responsible for the submitted code, tests and licensing. There is no CLA, DCO sign-off requirement, paid support commitment or guaranteed review turnaround.

Do not force-push or delete `main`. Keep workflow credentials minimal and secrets out of the repository. Changes to ownership, CI permissions and release processes deserve explicit review in their PR.

## Roles and responsibilities

| Role | Responsibility |
| --- | --- |
| Contributor | Propose and validate changes, respect licenses and protect private data |
| Maintainer | Triage, review, explain decisions, moderate project spaces and manage releases |
| Repository owner | Manage repository access, branch protection and security settings |

Maintainers can invite additional maintainers after sustained useful participation. Grant only the access needed and record ownership changes in a PR that updates CODEOWNERS and this document. Contributor status alone does not grant release or repository access.

## Releases and compatibility

Use the [release checklist](docs/RELEASING.md), keep a curated [changelog](CHANGELOG.md), and distinguish local validation from deployed validation and notarized distribution. Preview versions may change behavior and provider compatibility. Document breaking changes and migration steps before publishing them; do not promise stability that the project cannot verify.

## Conduct, security and support

Follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately through [SECURITY.md](SECURITY.md). Use [SUPPORT.md](SUPPORT.md) to route questions and bug reports. Do not discuss sensitive reports in public triage or release notes before coordinated disclosure.
