// Finds a project's local frontend: dev scripts from package.json plus loopback ports that answer HTTP.
import {readFileSync,existsSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {request} from 'node:http';

const FRAMEWORKS=[
 ['next',3000,'Next.js'],['nuxt',3000,'Nuxt'],['@remix-run/dev',5173,'Remix'],['@sveltejs/kit',5173,'SvelteKit'],['astro',4321,'Astro'],
 ['@angular/cli',4200,'Angular'],['vite',5173,'Vite'],['react-scripts',3000,'Create React App'],['gatsby',8000,'Gatsby'],['@storybook/react',6006,'Storybook'],['webpack-dev-server',8080,'Webpack']
];
const COMMON=[3000,3001,3002,4200,4321,5173,5174,5175,6006,8000,8080,8787];

export function projectHints(path){
 if(!path||!isAbsolute(path))return null;const file=join(path,'package.json');if(!existsSync(file))return null;
 let pkg;try{pkg=JSON.parse(readFileSync(file,'utf8').slice(0,500000))}catch{return null}
 const deps={...pkg.dependencies,...pkg.devDependencies},scripts=pkg.scripts||{};
 const framework=FRAMEWORKS.find(([dep])=>deps[dep]);const script=['dev','start','serve','develop','storybook'].find(s=>scripts[s]);
 const explicit=Number(String(scripts[script]||'').match(/(?:--port|-p|PORT=)\s*=?\s*(\d{2,5})/)?.[1])||null;
 return {name:String(pkg.name||'').slice(0,100),framework:framework?.[2]||null,script:script?{name:script,command:String(scripts[script]).slice(0,200)}:null,ports:[...new Set([explicit,framework?.[1]].filter(Boolean))]};
}

function probe(port,timeout=700){return new Promise(resolve=>{
 const req=request({host:'127.0.0.1',port,path:'/',method:'GET',timeout,headers:{accept:'text/html'}},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>{if(body.length<20000)body+=c});res.on('end',()=>{const title=body.match(/<title[^>]*>([^<]{0,120})/i)?.[1]?.trim()||'';resolve({port,status:res.statusCode,html:/text\/html/.test(res.headers['content-type']||''),title})})});
 req.on('timeout',()=>{req.destroy();resolve(null)});req.on('error',()=>resolve(null));req.end();
})}

export async function detectFrontends(projects=[]){
 const hints=projects.map(p=>({...p,hints:projectHints(p.path)}));
 const ports=[...new Set([...hints.flatMap(p=>p.hints?.ports||[]),...COMMON])].slice(0,24);
 const live=(await Promise.all(ports.map(p=>probe(p)))).filter(r=>r&&r.status<500&&r.html);
 return {projects:hints.map(p=>({id:p.id,name:p.name,framework:p.hints?.framework||null,script:p.hints?.script||null,ports:p.hints?.ports||[]})),
  servers:live.map(r=>({origin:'http://localhost:'+r.port,port:r.port,title:r.title,status:r.status,projectId:hints.find(p=>p.hints?.ports?.includes(r.port))?.id||null}))};
}
