import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sourceFiles} from './source-files.mjs';
const forbiddenWordHashes=new Set(['79fc935e374e922830eb89159d35468918a1843cf7fd84415449eac029bb7817']);
export function auditSource(files=sourceFiles()){
 const errors=[];
 for(const file of files){
  if(/^(?:build|dist|node_modules|\.atelier|research)\//.test(file)||/(?:^|\/)(?:\.env(?:\..*)?|\.DS_Store)$/.test(file)||/\.(?:sqlite(?:-.*)?|db(?:-.*)?|jsonl|pem|key|p12|webm|mp4|trace|log)$/.test(file)){errors.push(file+': private/generated file');continue}
  const stat=lstatSync(file);if(!stat.isFile()){errors.push(file+': only regular source files are allowed');continue}
  if(stat.size>2_000_000){errors.push(file+': unexpectedly large source file');continue}
  const data=readFileSync(file);if(data.includes(0))continue;
  const text=data.toString('utf8');
  if(/\/(?:Users|home)\/[a-z][a-z0-9_.-]{2,}\/(?:Brein|Library|\.codex|\.claude)/i.test(text))errors.push(file+': private home path');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|sk-(?:ant-)?[A-Za-z0-9_-]{32,}/.test(text))errors.push(file+': possible credential');
  if((text.toLowerCase().match(/[a-z]+/g)||[]).some(word=>forbiddenWordHashes.has(createHash('sha256').update(word).digest('hex'))))errors.push(file+': excluded organization reference');
 }
 if(errors.length)throw Error('Source policy failed:\n'+errors.join('\n'));
 return files;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const files=auditSource();console.log(`PASS public source: ${files.length} files; private outputs, credential patterns and excluded references checked`)}
