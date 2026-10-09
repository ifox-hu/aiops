// Local preview of static design artifacts, using the installed Node runtime.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src/main/resources/static/designs');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.png':'image/png' };
http.createServer((request,response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname); } catch { response.writeHead(400).end(); return; }
    const name = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = path.resolve(root,name);
    if(!filename.startsWith(root + path.sep) || !types[path.extname(filename)]) {response.writeHead(404).end();return;}
    fs.readFile(filename,(error,data) => {
        if(error) {response.writeHead(404).end();return;}
        response.writeHead(200,{'Content-Type':types[path.extname(filename)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(data);
    });
}).listen(9901,'127.0.0.1',() => console.log('Design preview: http://127.0.0.1:9901/'));
