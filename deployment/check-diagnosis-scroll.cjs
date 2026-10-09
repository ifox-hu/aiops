const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../docs');
const port = 8124;
const debugPort = 9924;
const types = { '.css':'text/css; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const name = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, name);
  if (!filename.startsWith(root + path.sep) || !types[path.extname(filename)]) { response.writeHead(404).end(); return; }
  fs.readFile(filename, (error, data) => { if (error) { response.writeHead(404).end(); return; } response.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control':'no-store' }); response.end(data); });
});
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(os.tmpdir(),'superbizagent-scroll-qa')}`,'about:blank'], { windowsHide:true, stdio:'ignore' });
  let socket;
  try {
    let tab;
    for (let i = 0; i < 80; i++) { try { const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); tab = list.find(item => item.type === 'page'); if (tab) break; } catch {} await pause(150); }
    assert(tab, 'Edge unavailable');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0; const pending = new Map();
    socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); } };
    const command = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
    const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    await command('Runtime.enable'); await command('Page.enable'); await command('Emulation.setDeviceMetricsOverride', { width:1600, height:1000, deviceScaleFactor:1, mobile:false });
    await command('Page.navigate', { url:`http://127.0.0.1:${port}/workbench-v2.html` });
    for (let i = 0; i < 60; i++) { if (await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row').length === 3")) break; await pause(150); }
    await evaluate("document.querySelector('#v2-diagnose-inline').click()");
    await pause(200);
    const before = await evaluate(`(() => { const grid = document.querySelector('.v2-workgrid').getBoundingClientRect(); const focus = document.querySelector('.v2-focus').getBoundingClientRect(); const queue = document.querySelector('.v2-queue-panel').getBoundingClientRect(); const assistant = document.querySelector('.v2-assistant').getBoundingClientRect(); return { grid:grid.height, focus:focus.height, queue:queue.height, assistant:assistant.height }; })()`);
    for (let i = 0; i < 120; i++) { if ((await evaluate("document.querySelector('#v2-report').textContent.length")) > 1000) break; await pause(100); }
    const after = await evaluate(`(() => { const grid = document.querySelector('.v2-workgrid').getBoundingClientRect(); const focus = document.querySelector('.v2-focus').getBoundingClientRect(); const queue = document.querySelector('.v2-queue-panel').getBoundingClientRect(); const assistant = document.querySelector('.v2-assistant').getBoundingClientRect(); const report = document.querySelector('#v2-report'); return { grid:grid.height, focus:focus.height, queue:queue.height, assistant:assistant.height, reportHeight:report.getBoundingClientRect().height, reportScroll:report.scrollHeight > report.clientHeight }; })()`);
    assert(Math.abs(before.grid - after.grid) <= 2, `grid grew ${before.grid} -> ${after.grid}`);
    assert(Math.abs(before.focus - after.focus) <= 2, `focus grew ${before.focus} -> ${after.focus}`);
    assert(Math.abs(before.queue - after.queue) <= 2, `queue grew ${before.queue} -> ${after.queue}`);
    assert(Math.abs(before.assistant - after.assistant) <= 2, `assistant grew ${before.assistant} -> ${after.assistant}`);
    assert(after.reportScroll, 'report did not become scrollable');
    await command('Page.navigate', { url:`http://127.0.0.1:${port}/incident-v2.html` });
    for (let i = 0; i < 60; i++) { if ((await evaluate("document.querySelector('#iv-title').textContent")) !== '正在载入故障') break; await pause(150); }
    await evaluate("document.querySelector('#iv-diagnose-inline').click()");
    await pause(200);
    const ivBefore = await evaluate(`(() => { const layout = document.querySelector('.iv-layout').getBoundingClientRect(); const main = document.querySelector('.iv-main').getBoundingClientRect(); const side = document.querySelector('.iv-side').getBoundingClientRect(); return { layout:layout.height, main:main.height, side:side.height }; })()`);
    for (let i = 0; i < 120; i++) { if ((await evaluate("document.querySelector('#iv-report').textContent.length")) > 1000) break; await pause(100); }
    const ivAfter = await evaluate(`(() => { const layout = document.querySelector('.iv-layout').getBoundingClientRect(); const main = document.querySelector('.iv-main').getBoundingClientRect(); const side = document.querySelector('.iv-side').getBoundingClientRect(); const report = document.querySelector('#iv-report'); return { layout:layout.height, main:main.height, side:side.height, reportHeight:report.getBoundingClientRect().height, reportScroll:report.scrollHeight > report.clientHeight }; })()`);
    assert(Math.abs(ivBefore.layout - ivAfter.layout) <= 2, `incident layout grew ${ivBefore.layout} -> ${ivAfter.layout}`);
    assert(Math.abs(ivBefore.main - ivAfter.main) <= 2, `incident main grew ${ivBefore.main} -> ${ivAfter.main}`);
    assert(Math.abs(ivBefore.side - ivAfter.side) <= 2, `incident side grew ${ivBefore.side} -> ${ivAfter.side}`);
    await evaluate("document.querySelector('#iv-report').textContent = '长报告内容'.repeat(2000)");
    await pause(100);
    const ivOverflow = await evaluate("(() => { const report = document.querySelector('#iv-report'); const layout = document.querySelector('.iv-layout').getBoundingClientRect(); return { scroll: report.scrollHeight > report.clientHeight, overflowY: getComputedStyle(report).overflowY, height: layout.height }; })()");
    assert.equal(ivOverflow.scroll, true, 'incident report did not become scrollable with long content');
    assert.equal(ivOverflow.overflowY, 'auto');
    assert(Math.abs(ivAfter.layout - ivOverflow.height) <= 2, 'incident layout changed after long content');
    console.log(JSON.stringify({ before, after, ivBefore, ivAfter, ivOverflow }, null, 2));
  } finally { socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
