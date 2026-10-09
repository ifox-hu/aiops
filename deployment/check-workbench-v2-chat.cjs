const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9916', '--user-data-dir=D:/tools/superbizagent-config/v2-chat-qa-profile',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let socket;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        tabs = await (await fetch('http://127.0.0.1:9916/json/list')).json();
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
    function command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve, reject });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }

    await command('Runtime.enable');
    await command('Page.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: 'http://127.0.0.1:9900/designs/workbench-v2.html' });
    for (let i = 0; i < 40; i++) {
      if (await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row').length > 0")) break;
      await pause(250);
    }
    await evaluate("const input=document.querySelector('#v2-form textarea');input.value='这个告警应该先验证什么？';document.querySelector('#v2-form').requestSubmit()");
    let answer = '';
    for (let i = 0; i < 240; i++) {
      answer = await evaluate("document.querySelectorAll('#v2-chat .v2-message.assistant')[document.querySelectorAll('#v2-chat .v2-message.assistant').length-1].textContent.trim()");
      if (answer && !answer.startsWith('正在结合')) break;
      await pause(500);
    }
    assert(answer.length > 20, 'assistant answer too short: ' + answer.slice(0, 120));
    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    console.log('PASS: assistant answered with current alert context, answer length=' + answer.length);
    await command('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });