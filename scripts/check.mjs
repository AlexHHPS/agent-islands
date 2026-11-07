import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {sourceFiles} from './source-files.mjs';
const files=sourceFiles();
for(const file of files){
 if(/\.(?:mjs|js)$/.test(file)&&!file.startsWith('ui/vendor/'))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
 if(file.endsWith('.sh'))execFileSync('bash',['-n',file],{stdio:'pipe'});
 if(file.endsWith('.md')){
  const text=readFileSync(file,'utf8');
  const links=[...text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(m=>m[1]);
  links.push(...[...text.matchAll(/(?:src|href|srcset)="([^" ]+)"/g)].map(m=>m[1]));
  for(const raw of links){if(/^(?:[a-z]+:|#|\/)/i.test(raw))continue;const dest=decodeURIComponent(raw.split('#')[0]);if(dest&&!existsSync(resolve(dirname(file),dest)))throw Error(`${file}: missing local link ${raw}`)}
 }
}
if(process.platform==='darwin')execFileSync('plutil',['-lint','native/Info.plist'],{stdio:'inherit'});
const pkg=JSON.parse(readFileSync('package.json')),lock=JSON.parse(readFileSync('package-lock.json'));
if(pkg.version!==lock.version||!readFileSync('native/Info.plist','utf8').includes('<string>'+pkg.version+'</string>')||!readFileSync('ui/index.html','utf8').includes('v'+pkg.version))throw Error('App/package version mismatch');
execFileSync(process.execPath,['scripts/asset-integrity.mjs'],{stdio:'inherit'});
console.log('PASS syntax, local documentation links, version consistency and assets');
