// GitHub Pages static regression: serves docs/ and verifies the browser-level Mock API.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../docs');
const port = 8123;
const debugPort = 9923;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep) || !contentTypes[path.extname(filename)]) {
      response.writeHead(404).end();
      return;
    }
    fs.readFile(filename, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes[path.extname(filename)],
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function waitFor(check, message, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = await check();
    if (value) return value;
    await pause(150);
  }
  throw new Error(message);
}

async function main() {
  const server = await startStaticServer();
  const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert(fs.existsSync(edge), 'Microsoft Edge not found. Set EDGE_PATH to msedge.exe.');
  const profile = path.join(os.tmpdir(), 'superbizagent-pages-static-qa');
  const browser = spawn(edge, [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let socket;
  try {
    const tabs = await waitFor(async () => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        return list.find(tab => tab.type === 'page') || null;
      } catch {
        return null;
      }
    }, 'Edge debugging endpoint unavailable');

    socket = new WebSocket(tabs.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });

    let id = 0;
    const pending = new Map();
    const runtimeErrors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const task = pending.get(message.id);
        if (task) {
          pending.delete(message.id);
          message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
        }
      }
      if (message.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push(JSON.stringify(message.params.exceptionDetails));
      }
    };
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const navigate = async page => {
      await command('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
    };

    await command('Runtime.enable');
    await command('Page.enable');

    await navigate('index.html');
    assert.equal(await evaluate("document.querySelectorAll('.card').length"), 3);
    assert.equal(await evaluate("document.querySelectorAll('.card a[href$=\"-v2.html\"]').length"), 3);

    await navigate('workbench-v2.html');
    await waitFor(() => evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row').length === 3"), 'workbench alerts did not load');
    assert.equal(await evaluate("document.querySelector('#v2-source').textContent"), '模拟数据');
    await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row')[1].click()");
    assert(await evaluate("document.querySelector('#v2-focus-title').textContent.length > 0"));
    await evaluate("document.querySelector('[data-tab=logs]').click()");
    await waitFor(() => evaluate("document.querySelectorAll('#v2-log .v2-log-line').length >= 3"), 'workbench logs did not load');
    await evaluate("document.querySelector('[data-tab=diagnosis]').click()");
    await evaluate("document.querySelector('#v2-diagnose-inline').click()");
    await waitFor(() => evaluate("document.querySelector('#v2-report').textContent.includes('建议排查顺序')"), 'workbench diagnosis stream did not complete');

    await navigate('incident-v2.html');
    await waitFor(() => evaluate("document.querySelector('#iv-title').textContent !== '正在载入故障'"), 'incident did not load');
    assert(await evaluate("document.querySelector('#iv-meta-alert').textContent.length > 0"));
    await evaluate("document.querySelector('[data-iv-tab=evidence]').click()");
    await waitFor(() => evaluate("document.querySelectorAll('#iv-log .iv-log-line').length >= 3"), 'incident logs did not load');
    assert(await evaluate("document.querySelectorAll('#iv-sources .iv-source').length >= 5"));

    await navigate('knowledge-v2.html');
    await waitFor(() => evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length === 5"), 'knowledge documents did not load');
    await evaluate("document.querySelector('[data-kv-mode=general]').click()");
    await evaluate("document.querySelector('#kv-form textarea').value='什么是 TCP 三次握手？';document.querySelector('#kv-form').requestSubmit()");
    await waitFor(() => evaluate("document.querySelectorAll('.kv-answer-text').length && document.querySelectorAll('.kv-answer-text')[0].textContent.length > 20"), 'general answer did not render');
    assert.equal(await evaluate("document.querySelectorAll('#kv-sources .kv-source').length"), 0);
    await waitFor(() => evaluate("document.querySelector(`#kv-send`).disabled === false"), `general request did not finish`);

    await evaluate("document.querySelector('[data-kv-mode=knowledge]').click()");
    await evaluate("document.querySelector('#kv-form textarea').value='CPU 使用率过高时应该先检查什么？';document.querySelector('#kv-form').requestSubmit()");
    await waitFor(() => evaluate("document.querySelectorAll('#kv-sources .kv-source').length >= 1"), 'knowledge sources did not render');
    await waitFor(() => evaluate("document.querySelectorAll('.kv-answer-text')[1].textContent.length > 20"), 'knowledge answer did not render');
    assert.deepEqual(runtimeErrors, [], 'browser runtime exceptions found');

    console.log('PASS: Pages index and three demo entries');
    console.log('PASS: workbench mock alerts, logs and diagnosis stream');
    console.log('PASS: incident mock evidence and knowledge sources');
    console.log('PASS: knowledge general mode and knowledge-first streaming');
    await command('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});