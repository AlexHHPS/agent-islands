# Design and identity

Agent Islands uses a quiet forest-green palette, warm surfaces, local fonts and inhabited SVG islands. The scene identifies a project; text and icons identify the state. Color alone must never communicate a blocker.

## Identity assets

- `assets/logo.svg`: standalone island/workshop mark, transparent background.
- `assets/banner.svg` and `assets/banner-es.svg`: README wordmark and promise.
- `assets/workspace-light.png`, `workspace-dark.png`, `browser-reference.png`: actual UI with demonstration fixtures.

The mark is original project artwork, licensed under Apache 2.0. It echoes the native app icon without borrowing provider logos. Codex and Claude Code are represented by their names in the documentation.

## Tokens

`ui/atelier.css` holds the compiled light/dark theme; `ui/tokens.css` holds product-specific terminal and state colors. Figtree is the UI font and JetBrains Mono is the terminal/code font; both are bundled with their original font licenses. The forest accent is `#42664e` in the light palette.

Use existing type, space, radius, motion and color tokens. SVG geometry and the logo's fixed palette are intentional standalone illustration values. Terminal ANSI colors and the Diorama scene palette have separate purposes from the UI theme.

## Layout and interaction

The world is a project canvas with an agent/terminal inspector. Opening an agent enlarges its island and makes its checkpoints available alongside the terminal. The controlled browser can occupy that same contextual side of the workspace. Visual references stay in the draft until the user sends them.

Keep empty, loading, error, unavailable and stale states distinguishable. Respect reduced motion, visible keyboard focus and contrast. Dense desktop layouts should use additional space for context rather than stretching prose.

## Documentation proof

The README uses native GitHub Markdown, local SVG assets and theme-aware screenshots. Its reading column should work without custom CSS on GitHub. Preview screenshots must use `?preview=1` fixture states, never an actual user's conversations, profile paths or browser account.

The design was prepared and rendered with the Atelier skill; those authoring tools are optional and are not build dependencies. The project ships its own assets and compiled tokens.
