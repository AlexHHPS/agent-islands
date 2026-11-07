# Preparing a release

Public hosting, repository settings, signing and notarization are separate publication steps. The source tree includes the policies and automation needed for review; it does not create a public repository or publish a release automatically.

## Validate the source

1. Update `package.json`, its lockfile, `native/Info.plist` and the changelog together.
2. Review all source changes and third-party notices. Keep private backups, evidence, logs and runtime caches outside the shared file set.
3. From a clean checkout, run the documented development commands, including the native GUI smoke test on a logged-in Mac.
4. Run `npm audit`, `npm run check:source` and `npm run check:secrets` (pinned Gitleaks). The built-in policy check is not a complete secret detector.
5. Run `npm run source:archive`. Inspect the archive listing and its checksum before sharing.

The source archive uses Git's non-ignored file list, fails if the publication policy rejects a file, and includes tests, lockfiles, licenses and community documents. It excludes `.atelier`, build output, private caches, databases, auth, logs and environment files. Ignored local data must never be force-added to a public commit.

## Validate the app

Check new and resumed conversations, adding the first directory, a multi-project workspace, profile selection, checkpoints, goal transitions and explicit permission-bypass indicators. Check browser component/region references, recordings, cancellation, profile-specific auth and QA evidence. Verify that optional summaries remain off until configured and explicitly requested. Confirm the app signature using `codesign --verify --deep --strict`.

Apple Silicon is locally validated. Validate Intel on actual hardware before labeling a downloadable Intel artifact supported. A successful compile alone is insufficient.

## Repository readiness

- Verify the repository description, clone links and community/support links.
- Confirm private vulnerability reporting is enabled and the security link works.
- Review issue templates and repository moderation settings.
- Confirm `main` requires PRs, the `macos` check and resolved review conversations; keep workflow permissions read-only.
- Inspect the staged diff and scanned history. This prepared tree does not contain imported historical commits.
- Confirm Apache-2.0, NOTICE and original third-party notices are present in source and distributed bundles.

## Binary distribution

Local builds are ad hoc signed. Public installers need an Apple Developer signing identity, hardened-runtime review, notarization and a tested update/distribution policy. Keep signing credentials in a protected release environment; never commit them. Produce checksums for published binaries and tie each artifact to a reviewed source revision.

Do not label an ad hoc local DMG as notarized, claim CI passed before it ran, or link to an unpublished release. Create a release only when its artifacts and evidence are ready for review.
