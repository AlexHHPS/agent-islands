# Vendor marks

Monochrome marks of the tools Agent Islands can run. `scripts/icons.mjs` inlines them into `ui/icons.js`,
and `ui/tokens.css` tints each one with its `--brand-<id>` colour.

The names and logos are trademarks of their owners: Claude Code (Anthropic), Codex (OpenAI), Gemini CLI (Google),
OpenCode (SST), Goose (Block), Hermes Agent (Nous Research) and Docker (Docker, Inc.). Agent Islands shows them
only to identify the tool a terminal runs; this implies no endorsement.

Each file is the owner's own mark, reduced to one colour (backgrounds and tiles removed, OpenCode's two tones
kept as full and 40% opacity of the same colour):

| File | Source |
|---|---|
| `claude.svg` | Claude Spark, Anthropic press kit (anthropic.com/press-kit) |
| `gemini.svg` | Gemini CLI monotone icon, geminicli.com/brand-kit |
| `opencode.svg` | OpenCode dark logo, opencode.ai/brand |
| `goose.svg` | block/goose repository, `documentation/static/img/goose.svg` |
| `hermes.svg` | NousResearch/hermes-agent repository, `assets/icon-master.svg` (coordinates rounded) |
| `docker.svg` | Docker mark, docker.com media resources |
| `codex.svg` | **Not official.** OpenAI publishes no SVG of the Codex symbol; this is the LobeHub Icons redrawing (`@lobehub/icons-static-svg` 1.102.0), under the MIT License below. Replace it when OpenAI publishes one. |

Recolouring departs from the brand guidelines of Anthropic, OpenAI, OpenCode and Docker, which ask for their
marks in the official colours. The single-colour treatment here is a deliberate product choice.

## MIT License (LobeHub Icons)

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
