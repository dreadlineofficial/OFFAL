// Builds dist/offalr.html: the horror game as one self-contained file (three.js, game, CSS, icon inlined)
// that runs straight from disk. Usage: `npm run build:offalr`.
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const rd=(p,enc='utf8')=>readFile(join(root,p),enc);
const t0=Date.now();
// --demo: the free demo (GameJolt): the hiring office and B1-B3 (see config.js DEMO) -> dist/offalr-demo.html
const demo=process.argv.includes('--demo');

const js=(await build({entryPoints:[join(root,'offalr/src/main.js')],bundle:true,minify:true,format:'iife',write:false,legalComments:'none',target:'es2020',
 plugins:[{name:'three-vendor',setup(b){b.onResolve({filter:/^three$/},()=>({path:join(root,'offalr/src/three-r.js')}))}}]})).outputFiles[0].text;

const icon='data:image/png;base64,'+(await rd('offalr/icon.png',null)).toString('base64');
let html=(await rd('offalr/index.html')).replace(/\r\n/g,'\n');/* Windows checkouts may use CRLF */
const swap=(from,to)=>{if(!html.includes(from))throw new Error('build: offalr/index.html is missing '+from);html=html.replace(from,()=>to)};
swap('<link rel="icon" href="icon.png" type="image/png">','<link rel="icon" href="'+icon+'" type="image/png">');
swap('<link rel="stylesheet" href="offal.css">','<style>'+await rd('offalr/offal.css')+'</style>');
html=html.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/,'');
swap('<script type="module" src="src/main.js"></script>',(demo?'<script>window.OFFAL_DEMO=true</script>':'')+'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');

await mkdir(join(root,'dist'),{recursive:true});
const out=demo?'dist/offalr-demo.html':'dist/offalr.html';
if(demo)html=html.replace(/<title>([^<]*)<\/title>/,'<title>$1 (Demo)</title>');
await writeFile(join(root,out),html);
console.log(`${out}  ${(Buffer.byteLength(html)/1048576).toFixed(2)} MB  (${Date.now()-t0} ms)`);
