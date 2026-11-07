import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const files=readdirSync('ui/vendor').sort().map(n=>'ui/vendor/'+n);
const sums=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const manifest='config/assets.json';
if(process.argv.includes('--write')){writeFileSync(manifest,JSON.stringify(sums,null,2)+'\n');console.log('Wrote asset manifest; review asset origins and licenses before committing')}
else{const expected=JSON.parse(readFileSync(manifest));if(JSON.stringify(sums)!==JSON.stringify(expected))throw Error('Vendor asset integrity changed; review before updating the manifest');console.log(`PASS vendor integrity: ${files.length} assets and original notices`)}
