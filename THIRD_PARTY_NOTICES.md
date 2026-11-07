# Third-party notices

Agent Islands source is MIT licensed. Third-party components retain their original terms; this file does not replace their license text.

| Component | Use | License and included notice |
| --- | --- | --- |
| Diorama | Dependency-free SVG island renderer | MIT, copyright 2026 Eduardo Calvo; [original license](ui/vendor/diorama-LICENSE) |
| xterm.js | Terminal rendering | MIT; [license](ui/vendor/xterm-LICENSE) |
| xterm addon-fit | Terminal sizing | MIT; [license](ui/vendor/addon-fit-LICENSE) |
| Figtree | UI font | SIL Open Font License 1.1; [notice](ui/vendor/Figtree-OFL.txt) |
| JetBrains Mono | Monospace font | SIL Open Font License 1.1; [notice](ui/vendor/JetBrains-Mono-OFL.txt) |
| Playwright and playwright-core | Browser automation and testing | Apache-2.0; original LICENSE/NOTICE files accompany installed and packaged modules |
| Node.js | Bundled QA runtime | Node.js distribution license, including bundled third-party terms; copied into the app under `Contents/Resources/qa/runtime/LICENSE` |

Npm dependencies are pinned in [package-lock.json](package-lock.json). Runtime versions and archive checksums are pinned in [config/runtime.json](config/runtime.json). Chromium is downloaded on demand by Playwright and has its own third-party notices; it is not part of the source archive.

AppKit, WebKit, speech services and other macOS frameworks are supplied by the operating system. Optional research engines are not redistributed by Agent Islands. Review their individual licenses before using or packaging them.

Provider and platform names identify compatibility only. Their owners do not sponsor or endorse this project. The Agent Islands identity assets are original project work covered by the root MIT License.
