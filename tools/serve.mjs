// Tiny zero-dependency static server: `npm start` (or `node tools/serve.mjs [port]`) then open http://localhost:8080
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),port=+(process.argv[2]||process.env.PORT||8080);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain'};
createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';const f=normalize(join(root,p));if(!f.startsWith(root))throw 0;
 const s=await stat(f);if(s.isDirectory())throw 0;res.writeHead(200,{'Content-Type':types[extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(f))}
 catch{res.writeHead(404);res.end('not found')}}).listen(port,()=>console.log(`Ember City running at http://localhost:${port}`));
