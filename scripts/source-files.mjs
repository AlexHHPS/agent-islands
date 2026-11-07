import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
export function sourceFiles(){
 try{return [...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean))].sort()}
 catch{
  // Source archives have no Git metadata. Generated/private roots remain excluded.
  const omitted=new Set(['.git','.atelier','build','dist','node_modules','.idea','.vscode','__pycache__']);
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{if(omitted.has(entry.name))return [];const file=join(dir,entry.name);return entry.isDirectory()?walk(file):[file]});
  return walk('.').sort();
 }
}
