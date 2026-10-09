const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9919', '--user-data-dir=D:/tools/superbizagent-config/v2-general-qa-profile',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        tabs = await (await fetch('http://127.0.0.1:9919/json/list')).json();
        if (tabs.some(tab => tab.type === 'page')) break;
      } catch {}
      await pause(200);
    }
    assert(tabs, 'Edge debugging endpoint unavailable');
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const task = pending.get(message.id);
        if (task) {
          pending.delete(message.id);
          message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
        }
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    };
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };

    await command('Runtime.enable');
    await command('Page.enable');
    await command('Page.navigate', { url: 'http://127.0.0.1:9900/designs/knowledge-v2.html' });
    for (let i = 0; i < 40; i++) {
      if (await evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length > 0")) break;
      await pause(250);
    }
    await evaluate("document.querySelector('[data-kv-mode=general]').click()");
    assert.equal(await evaluate("document.querySelector('#kv-mode-label').textContent"), '通用问答');
    await evaluate("document.querySelector('#kv-form textarea').value='什么是 TCP 三次握手？请简短回答';document.querySelector('#kv-form').requestSubmit()");
    let answer = '';
    for (let i = 0; i < 300; i++) {
      answer = await evaluate("document.querySelectorAll('.kv-answer-text')[document.querySelectorAll('.kv-answer-text').length-1].textContent.trim()");
      if (answer.length > 10 && !answer.startsWith('正在')) break;
      await pause(500);
    }
    assert(answer.length > 10, 'general answer too short: ' + answer.slice(0, 120));
    assert.equal(await evaluate("document.querySelectorAll('#kv-sources .kv-source').length"), 0);
    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    console.log('PASS: knowledge-v2 general mode answers without knowledge retrieval');
    await command('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });