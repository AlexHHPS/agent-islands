// Resolves a generated script position (from React 19 _debugStack or bundler output) to the
// authored file and line through the page's own source maps. Reads only what the dev server serves.
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGIT=Object.fromEntries([...B64].map((c,i)=>[c,i]));
const MAX_BYTES=12*1024*1024;

function decodeSegment(text){const out=[];let value=0,shift=0;for(const c of text){const d=DIGIT[c];if(d===undefined)return null;value+=(d&31)<<shift;if(d&32){shift+=5;continue}out.push(value&1?-(value>>>1):value>>>1);value=0;shift=0}return out}

// Decodes mappings only up to the requested line: source-map state is cumulative across lines.
export function lookup(map,line,column){
 if(map.sections){const l=line-1,c=column-1;let found=null;for(const s of map.sections){const o=s.offset||{line:0,column:0};if(o.line<l||o.line===l&&o.column<=c)found=s}if(!found?.map)return null;const o=found.offset||{line:0,column:0};return lookup(found.map,l-o.line+1,l===o.line?c-o.column+1:column)}
 const lines=String(map.mappings||'').split(';');if(line<1||line>lines.length)return null;
 let src=0,oLine=0,oCol=0,best=null;
 for(let i=0;i<line;i++){let gCol=0;for(const raw of lines[i].split(',')){if(!raw)continue;const seg=decodeSegment(raw);if(!seg)return null;gCol+=seg[0];if(seg.length>=4){src+=seg[1];oLine+=seg[2];oCol+=seg[3]}
  if(i===line-1&&seg.length>=4&&gCol<=column-1)best={source:src,line:oLine+1,column:oCol+1}}}
 if(!best)return null;const name=map.sources?.[best.source];if(!name)return null;
 return {file:(map.sourceRoot?map.sourceRoot.replace(/\/?$/,'/'):'')+name,line:best.line,column:best.column};
}

// Bundler prefixes are noise for an agent; keep a project-relative path when possible.
export function cleanSourcePath(file,projectPaths=[]){
 let f=String(file||'').replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/,'').replace(/^webpack:\/\/[^/]*\//,'').replace(/^turbopack:\/\/\/?(?:\[project\]\/)?/,'').replace(/^rsc:\/\/[^/]*\/[^/]*\//,'').replace(/^file:\/\//,'').replace(/^\/@fs\//,'/').replace(/\?.*$/,'');
 try{if(/^https?:\/\//.test(f))f=new URL(f).pathname}catch{}
 f=decodeURIComponent(f).replace(/^\.\//,'');
 for(const root of projectPaths)if(root&&f.startsWith(root.replace(/\/?$/,'/')))return f.slice(root.replace(/\/?$/,'/').length);
 return f.replace(/^\/(?=(?:src|app|pages|components|lib)\/)/,'');
}

export class SourceResolver {
 constructor(fetchText){this.fetchText=fetchText;this.maps=new Map()}
 async map(url){
  if(this.maps.has(url))return this.maps.get(url);
  const task=(async()=>{
   const script=await this.fetchText(url);if(!script||script.length>MAX_BYTES)return null;
   const m=[...script.matchAll(/[#@]\s*sourceMappingURL=([^\s'"*]+)/g)].at(-1);if(!m)return null;
   const ref=m[1];let raw;
   if(ref.startsWith('data:')){const comma=ref.indexOf(',');const body=ref.slice(comma+1);raw=/;base64/.test(ref.slice(0,comma))?Buffer.from(body,'base64').toString('utf8'):decodeURIComponent(body)}
   else raw=await this.fetchText(new URL(ref,url).href);
   if(!raw||raw.length>MAX_BYTES)return null;return JSON.parse(raw);
  })().catch(()=>null);
  this.maps.set(url,task);if(this.maps.size>40)this.maps.delete(this.maps.keys().next().value);return task;
 }
 async resolve(position,projectPaths=[]){
  if(!position)return null;
  if(position.exact||!position.url)return {file:cleanSourcePath(position.file,projectPaths),line:position.line||null,column:position.column||null,exact:!!position.exact};
  const url=position.url.replace(/^webpack-internal:\/\/\//,'');
  if(/^https?:\/\//.test(url)){const map=await this.map(url);const hit=map&&lookup(map,position.line,position.column);if(hit)return {file:cleanSourcePath(hit.file,projectPaths),line:hit.line,column:hit.column,exact:true}}
  // Unmapped dev servers (for example Vite without maps) still reveal the module path.
  return {file:cleanSourcePath(url,projectPaths),line:position.line,column:position.column,exact:false};
 }
}
