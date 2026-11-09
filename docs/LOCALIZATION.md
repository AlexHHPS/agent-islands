# Localization

Agent Islands supports Spanish (`es`) and English (`en`) throughout app-owned UI, accessibility labels, native menus/dialogues, OS permission descriptions, QA/browser messages and generated context instructions.

## Choose a language

Open the settings/help button and select **Application language / Idioma de la aplicación**. Changes apply immediately and persist. The native app initially uses the Mac's preferred language when Spanish is preferred, otherwise English. The browser-only preview defaults to Spanish; use `?preview=1&lang=en` for an English demonstration.

Changing language preserves agent processes, terminal output, drafts, attachments, workspace selections and typed form values. App labels and date/number formatting change; user project names, paths, prompts, provider conversations and page content do not become translation keys. Saved summaries and evidence keep the language in which they were recorded. Newly requested summaries, context prompts, references and checks use the selected language.

Dictation and speech select the matching locale. Native permission descriptions are bundled in both languages; system-owned dialogues also follow macOS localization behavior.

## Shared catalogues

`ui/locales/es.json` and `ui/locales/en.json` are the canonical message catalogues. `scripts/locales.mjs` generates `ui/locales.js` for offline WKWebView use; the app has no network translation service. Swift reads the bundled JSON and the Node QA service reads the same catalogues. QA uses request-local language context, so simultaneous Spanish and English requests cannot change each other's locale. Machine IDs, status values, protocol keys, selectors and paths remain stable.

```bash
npm run locales:update
npm run check
npm run test:locales
```

The checks reject missing catalogue entries, mismatched interpolation placeholders and a stale generated bundle. Build regenerates the bundle. Commit both JSON catalogues and the generated JS when changing messages.

## Write localizable text

Use `I18n.t(key, ...values)` for UI messages, `tr` for complete text templates, and `ht` for app-authored HTML. Their interpolation values remain opaque. Use `I18n.bind`/`I18n.attribute` for live property/attribute labels. The HTML helper marks only developer-authored text and accessible attributes for refresh; it never searches user content for words to replace. Do not pass a user's name, prompt, browser text, terminal output or whole received record into the translator.

Prefer complete messages for dynamic sentences that need reordered words or plural forms. Keep message placeholders stable (`{0}`, `{1}`), escape user values at the existing HTML boundary, use `I18n.count` with `.one`/`.other` catalogue entries for count-dependent messages, and use `I18n.locale` for date/number formatting. Do not translate command identifiers, JSON keys or harness arguments.

Swift uses `L(key, ...values)`; Node uses the helpers in `qa/i18n.mjs`. Intentionally submitted context instructions are localized; their permissions and machine-readable schemas must remain identical. App language is supplied to QA requests and inherited by newly launched harness/MCP processes without rewriting the user's own prompt.

## Adding a locale

Add a complete catalogue and native `InfoPlist.strings`, update the supported-language lists in the UI, Swift and Node, expose its autonym in the language selector, and include its resources in packaging. Extend locale-sensitive voice/formatting selection and tests. Keep unsupported-language handling explicit rather than silently treating an incomplete catalogue as translated.

## Validation

The localization suite exercises English preview surfaces and empty/loading/error states, switching between languages, persisted preference, native preference messages, placeholder safety, concurrent QA locales, escaped user names and preservation of terminal output, drafts and form selections. Native self-tests exercise the same catalogue in Swift. Existing fixture suites continue to verify the product behavior in Spanish.
