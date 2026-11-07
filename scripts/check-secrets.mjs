import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {auditSource} from './check-source.mjs';
const files=auditSource(),config=JSON.parse(readFileSync('config/security-tools.json')).gitleaks;
if(process.platform!=='darwin'||!config.sha256[process.arch])throw Error('Pinned scanner supports macOS arm64/x64');
const cache=resolve('build/tools'),name=`gitleaks_${config.version}_darwin_${process.arch}.tar.gz`,archive=join(cache,name);
mkdirSync(cache,{recursive:true});
let bytes;try{bytes=readFileSync(archive)}catch{}
const digest=data=>createHash('sha256').update(data).digest('hex');
if(!bytes||digest(bytes)!==config.sha256[process.arch]){
 const response=await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${config.version}/${name}`);
 if(!response.ok)throw Error('Secret scanner download failed');bytes=Buffer.from(await response.arrayBuffer());
 if(digest(bytes)!==config.sha256[process.arch])throw Error('Secret scanner checksum mismatch');writeFileSync(archive,bytes);
}
execFileSync('tar',['-xzf',archive,'-C',cache]);
const temp=mkdtempSync(join(tmpdir(),'islands-secret-scan-'));
try{
 for(const file of files){const dest=join(temp,file);mkdirSync(dirname(dest),{recursive:true});cpSync(file,dest)}
 execFileSync(join(cache,'gitleaks'),['dir',temp,'--config',resolve('.gitleaks.toml'),'--redact','--no-banner'],{stdio:'inherit'});
 console.log(`PASS independent secret scan: ${files.length} public source files`);
}finally{rmSync(temp,{recursive:true,force:true})}
