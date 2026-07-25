const http = require('http'), fs = require('fs'), path = require('path')
const ROOT = process.env.DIST || 'dist'
const TYPES = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.ico':'image/x-icon' }
http.createServer((req,res)=>{
  let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]))
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT,'index.html')
  fs.readFile(file,(e,buf)=>{ if(e){res.writeHead(404);res.end('nf');return}
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'}); res.end(buf) })
}).listen(4173, ()=>console.log('serving on 4173'))