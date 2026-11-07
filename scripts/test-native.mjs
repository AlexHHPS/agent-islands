import {execFileSync} from 'node:child_process';
import {readFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
if(process.platform!=='darwin')throw Error('Native checks require macOS');
const binary=resolve('build/Agent Islands.app/Contents/MacOS/Agent Islands');
const env={...process.env};delete env.CODEX_HOME;delete env.CLAUDE_CONFIG_DIR;
execFileSync(binary,['--self-test'],{stdio:'inherit',timeout:30000,env});
if(!process.argv.includes('--self-only')){
 const report='/tmp/agent-islands-smoke-result.txt';rmSync(report,{force:true});
 execFileSync(binary,['--smoke-test'],{stdio:'inherit',timeout:45000,env});
 const text=readFileSync(report,'utf8');console.log(text);
 if(text.includes('FAIL')||text.split('\n').filter(l=>l.startsWith('PASS')).length<8)throw Error('Native smoke checks failed');
}
