# Getting help

Agent Islands is a macOS developer preview maintained as an open-source project. Community help is best effort; there is no guaranteed response time or commercial support agreement.

## Choose a channel

| Need | Where to go |
| --- | --- |
| Installation, usage or troubleshooting question | [GitHub Discussions](https://github.com/AlexHHPS/agent-islands/discussions) |
| Reproducible app defect | [Bug report form](https://github.com/AlexHHPS/agent-islands/issues/new?template=bug_report.yml) |
| Feature proposal | [Feature request form](https://github.com/AlexHHPS/agent-islands/issues/new?template=feature_request.yml) |
| Missing or incorrect documentation | [Documentation form](https://github.com/AlexHHPS/agent-islands/issues/new?template=documentation.yml) |
| Security vulnerability | [Private reporting instructions](SECURITY.md) |
| Harassment or harmful content | [Code of conduct and reporting](CODE_OF_CONDUCT.md) |

English and Spanish are welcome. Search existing discussions and issues before opening a new one.

## Before asking

Check the [README](README.md), [Spanish introduction](README.es.md), [development troubleshooting](docs/DEVELOPMENT.md#troubleshooting) and [QA guide](docs/QA.md). Include your macOS version, CPU architecture, app version, relevant CLI version and the steps that led to the issue. State the expected result and what actually happened.

Use a minimal fixture where possible. Remove private prompts, credentials, cookies, personal paths, customer data and provider databases. Do not upload the app support directory or raw browser authentication. Inspect screenshots and recordings before sharing them.

## Which project can help?

Agent Islands owns workspace organization, its native/UI bridge, conversation discovery adapters and controlled-browser/QA integration. Provider authentication, model access, billing and the CLI's own permission engine belong to the provider. Explain the observed boundary when reporting a problem; a reproduction directly in the CLI can help distinguish the two.

See the [README's current limits](README.md#current-limits-and-next-work). Intel hardware validation, public binary notarization and localization remain open work. The app's optional summary server is configured separately from agent harness accounts.

## Commercial use and collaboration

Commercial use is permitted by Apache 2.0 without prior permission or license fees. If you use Agent Islands in a business, you are welcome to contact [@AlexHHPS](https://github.com/AlexHHPS) through [Discussions](https://github.com/AlexHHPS/agent-islands/discussions) about integrations, collaboration or commercial support. Contact is optional and is not an extra license condition. Do not post confidential business details in a public discussion. Any paid support would require a separate agreement.
