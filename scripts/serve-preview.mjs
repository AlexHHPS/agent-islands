// Development proof only. The macOS application never starts this server.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('ui');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found')}
}).listen(8768,'127.0.0.1',()=>process.stdout.write('Proof server: http://127.0.0.1:8768\n'));
