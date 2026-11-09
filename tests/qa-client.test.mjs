import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

// Fixture assertions use Spanish independently of the calling harness locale.
process.env.AGENT_ISLANDS_LANGUAGE='es';
const root=mkdtempSync(join(tmpdir(),'islands-native-client-'));
const run=(command,args)=>new Promise((resolve,reject)=>{const p=spawn(command,args,{stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(Error(out)))});
try{
 const binary=join(root,'qa-client');await run('swiftc',['-swift-version','5','native/Localization.swift','native/QAClient.swift','tests/QAClientSmoke.swift','-o',binary]);const output=await run(binary,[process.execPath,resolve('qa/service.mjs'),join(root,'qa')]);assert(output.includes('PASS native QA client'));console.log(output.trim());
}finally{rmSync(root,{recursive:true,force:true})}
