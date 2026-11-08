# Development

## Toolchain

Use macOS 14+, Xcode Command Line Tools, Node.js 24.22.2, npm and Python 3. Build scripts support the host's `arm64` or `x86_64` architecture. Apple Silicon is locally verified; Intel needs hardware validation. The deployment target is macOS 14.

```bash
xcode-select --install
npm ci
npx playwright install chromium
npm run check
npm run build
npm test
npm run test:native
npm run check:source
npm run check:secrets
```

`xcode-select --install` is needed only if the tools are absent. Build with a full Xcode installation if your selected SDK cannot compile AppKit/WebKit. No private agent skills, global instruction files or machine-specific model router are required.

## Commands

| Command | Result |
| --- | --- |
| `npm run locales:update` | Generate the offline shared-catalogue UI bundle |
| `npm run test:locales` | Language switching, scope isolation and content preservation checks |
| `npm run preview` | Local fixture UI at `http://127.0.0.1:8768/?preview=1` |
| `npm run check` | JS, shell and plist syntax; asset integrity and documentation links |
| `npm run build` | Native app and DMG, host architecture, ad hoc signature |
| `npm test` | PTY, UI, QA, browser, workspace, state and broker fixtures |
| `npm run test:native` | Native self-tests and isolated app smoke test |
| `npm run check:source` | Public-file policy, private paths and credential-pattern checks |
| `npm run check:secrets` | Pinned, checksum-verified Gitleaks scan of public source files |
| `npm run source:archive` | Audited source tarball and SHA-256 in `dist/` |

Build before running the full tests: PTY and native-client tests use the compiled products. The app bundles Node and Playwright; it downloads Chromium separately when QA is prepared. The test command uses Playwright's installed Chromium, not a globally installed Chrome.

## Testing without real accounts

Tests use temporary roots, local HTTP fixtures, mock native bridge messages and real browser instances. The standard native smoke test uses a shell spy in place of a real provider. Do not use `--smoke-codex` for routine verification: that diagnostic explicitly invokes a real authenticated harness and is outside the standard suite.

`test:native` launches a GUI app and requires a logged-in macOS session. CI runs its self-test portion with `--self-only`; the GUI smoke test is a local release check. Keep fixture evidence out of Git. Do not attach raw diagnostics or actual provider data to issues.

## UI and design

The UI is plain JavaScript and CSS. `ui/atelier.css` and `ui/tokens.css` define the visual system. Vendor assets and original licenses are committed; the build does not need the original design tools. For a screenshot, use preview fixtures and remove any local identity from the data. See [design](DESIGN.md).

See [localization](LOCALIZATION.md) before adding or editing app text.

## Runtime and dependencies

`config/runtime.json` pins the Node version and archive digests for both Mac architectures. `scripts/package-qa.mjs` verifies the archive before extraction and packages the relevant runtime. Update `.node-version`, npm engines, runtime digests and lockfile together. Never replace a checksum just to make a failed download pass.

Use `npm ci` to reproduce the lockfile. The vendor script refreshes xterm assets from installed packages. Font and Diorama assets have an integrity manifest. When intentionally updating those assets, review upstream license changes and regenerate the manifest with `node scripts/asset-integrity.mjs --write`.

## Troubleshooting

- **CLI missing:** authenticate it outside the app and check the executable and configuration directory under Profiles. A GUI app's PATH may differ from an interactive shell.
- **History empty:** select the correct profile root. Provider formats change; include the CLI version and a sanitized schema description in a bug report.
- **Chromium unavailable:** prepare QA under Health. Downloads require network access and disk space.
- **Summary unavailable:** configure an endpoint/model under IA and add a key if the server requires it. The summary provider is optional.
- **A test cannot find the PTY helper:** run `npm run build` first.
- **A build is blocked by macOS:** local artifacts are ad hoc signed, not notarized. Use a trusted checkout and your normal local development workflow.

## CI

The workflow uses read-only repository permissions, pinned action commits, a pinned Node version and fixture tests. It does not sign a public release, publish evidence or access provider accounts. Hosted CI status must be checked in the actual repository after publication. Action and npm updates are proposed by Dependabot.
