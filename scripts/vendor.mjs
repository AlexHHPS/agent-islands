import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('ui/vendor', { recursive: true });
for (const [src, dst] of [
  ['node_modules/@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['node_modules/@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['node_modules/@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ['node_modules/@xterm/xterm/LICENSE', 'xterm-LICENSE'],
  ['node_modules/@xterm/addon-fit/LICENSE', 'addon-fit-LICENSE'],
]) copyFileSync(src, `ui/vendor/${dst}`);
