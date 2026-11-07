import {mkdirSync,writeFileSync,mkdtempSync,cpSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {auditSource} from './check-source.mjs';
const files=auditSource(),version=JSON.parse(readFileSync('package.json')).version;
const name=`agent-islands-${version}`,temp=mkdtempSync(join(tmpdir(),'islands-source-'));
mkdirSync('dist',{recursive:true});
try{
 for(const file of files){const dest=join(temp,name,file);mkdirSync(dirname(dest),{recursive:true});cpSync(file,dest)}
 const archive=resolve('dist',name+'-source.tar.gz');
 execFileSync('tar',['-czf',archive,'-C',temp,name],{env:{...process.env,COPYFILE_DISABLE:'1'}});
 const sum=createHash('sha256').update(readFileSync(archive)).digest('hex');
 writeFileSync(archive+'.sha256',sum+'  '+name+'-source.tar.gz\n');console.log(`Audited source: ${archive} (${files.length} files)`);
}finally{rmSync(temp,{recursive:true,force:true})}
