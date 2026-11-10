import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';

// The distributed app carries a verified runtime; QA doesn't depend on shell aliases or Homebrew.
const {version,sha256}=JSON.parse(await readFile('config/runtime.json','utf8'));
const arch=process.arch;if(process.platform!=='darwin'||!sha256[arch])throw Error('Packaging requires a native macOS arm64 or x64 host');
const name=`node-v${version}-darwin-${arch}`,cache=resolve('build/qa-runtime'),target=resolve('build/Agent Islands.app/Contents/Resources/qa');
await mkdir(cache,{recursive:true});await mkdir(target,{recursive:true});
const archive=join(cache,name+'.tar.gz'),base=`https://nodejs.org/dist/v${version}/`;
const expected=sha256[arch];
let bytes;try{bytes=await readFile(archive)}catch{}
if(!bytes||createHash('sha256').update(bytes).digest('hex')!==expected){const response=await fetch(base+name+'.tar.gz');if(!response.ok)throw Error('Node download failed');bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Node checksum mismatch');await writeFile(archive,bytes)}
await rm(join(cache,name),{recursive:true,force:true});
execFileSync('/usr/bin/tar',['-xzf',archive,'-C',cache]);
await rm(join(target,'runtime/bin'),{recursive:true,force:true});await mkdir(join(target,'runtime/bin'),{recursive:true});
await cp(join(cache,name,'bin/node'),join(target,'runtime/bin/node'));await cp(join(cache,name,'LICENSE'),join(target,'runtime/LICENSE'));
for(const file of ['service.mjs','browser.mjs','i18n.mjs','inspect.mjs','sourcemap.mjs','annotations.mjs','detect.mjs'])await cp('qa/'+file,join(target,file));
await rm(join(target,'node_modules'),{recursive:true,force:true});
for(const module of ['playwright','playwright-core'])await cp('node_modules/'+module,join(target,'node_modules',module),{recursive:true});
console.log('QA packaged with verified Node '+version+' and locked Playwright dependencies');
