// Regression for the v2 workbench / incident deep dive / knowledge assistant.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const output = path.join(__dirname, 'v2-previews');
fs.mkdirSync(output, { recursive: true });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9918', '--user-data-dir=D:/tools/superbizagent-config/v2-suite-qa-profile',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        tabs = await (await fetch('http://127.0.0.1:9918/json/list')).json();
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
    async function checkLayout(name, width, height) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await pause(350);
      const result = await evaluate(`(() => {
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const clipped = [...document.querySelectorAll('h1,h2,h3,p,button,a,span,strong')].filter(el => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return false;
          const style = getComputedStyle(el);
          return el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'visible' && style.overflowX !== 'visible';
        }).map(el => (el.textContent || el.tagName).trim().slice(0, 60));
        return { overflow, clipped };
      })()`);
      assert(result.overflow <= 2, `${name} ${width}x${height} horizontal overflow ${result.overflow}`);
      assert.deepEqual(result.clipped, [], `${name} ${width}x${height} clipped text: ${result.clipped.join(' | ')}`);
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${name}-${width}x${height}.png`), Buffer.from(image.data, 'base64'));
    }

    await command('Runtime.enable');
    await command('Page.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });

    await command('Page.navigate', { url: 'http://127.0.0.1:9900/designs/workbench-v2.html' });
    for (let i = 0; i < 40; i++) {
      if (await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row').length > 0")) break;
      await pause(250);
    }
    assert.equal(await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row').length"), 3);
    await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row')[1].click()");
    const chosen = await evaluate("document.querySelector('#v2-focus-title').textContent");
    await evaluate("document.querySelector('#v2-detail').click()");
    await pause(1600);
    assert(await evaluate("location.pathname.endsWith('incident-v2.html')"), 'did not navigate to incident-v2');
    assert.equal(await evaluate("document.querySelector('#iv-title').textContent"), chosen);
    assert.equal(await evaluate("document.querySelector('#iv-meta-alert').textContent.length > 0"), true);
    await evaluate("document.querySelector('[data-iv-tab=evidence]').click()");
    for (let i = 0; i < 30; i++) {
      if (await evaluate("document.querySelectorAll('#iv-log .iv-log-line').length > 0")) break;
      await pause(200);
    }
    assert.equal(await evaluate("document.querySelectorAll('#iv-log .iv-log-line').length > 0"), true);
    assert.equal(await evaluate("document.querySelectorAll('#iv-sources .iv-source').length > 0"), true);
    await evaluate("document.querySelector('[data-iv-tab=handover]').click()");
    await evaluate("document.querySelector('#iv-add-note').click(); document.querySelector('#iv-note-form textarea').value='已确认实例持续高负载，等待核对最近变更。'; document.querySelector('#iv-note-form').requestSubmit()");
    await pause(300);
    assert.equal(await evaluate("document.querySelector('#iv-check-note').classList.contains('done')"), true);
    await evaluate("document.querySelector('#iv-handover-note').value='影响范围待确认，已完成初步诊断。'; document.querySelector('#iv-save-handover').click()");
    await pause(300);
    assert.equal(await evaluate("document.querySelector('#iv-check-handover').classList.contains('done')"), true);
    await checkLayout('incident-v2-desktop', 1440, 1080);
    await checkLayout('incident-v2-mobile', 390, 844);

    await command('Page.navigate', { url: 'http://127.0.0.1:9900/designs/knowledge-v2.html' });
    for (let i = 0; i < 40; i++) {
      if (await evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length > 0")) break;
      await pause(250);
    }
    assert(await evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length >= 5"), 'documents did not load');
    await evaluate("document.querySelector('#kv-filter-input').value='cpu';document.querySelector('#kv-filter-input').dispatchEvent(new Event('input',{bubbles:true}))");
    assert.equal(await evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length"), 1);
    await evaluate("document.querySelector('#kv-filter-input').value='';document.querySelector('#kv-filter-input').dispatchEvent(new Event('input',{bubbles:true}))");
    await evaluate("document.querySelector('#kv-form textarea').value='CPU 使用率过高时应该先检查什么？请简短回答';document.querySelector('#kv-form').requestSubmit()");
    let answer = '';
    for (let i = 0; i < 300; i++) {
      answer = await evaluate("document.querySelectorAll('.kv-answer-text')[document.querySelectorAll('.kv-answer-text').length-1].textContent.trim()");
      if (answer.length > 20 && !answer.startsWith('正在') && !answer.startsWith('已检索')) break;
      await pause(500);
    }
    assert(answer.length > 20, 'knowledge answer too short: ' + answer.slice(0, 120));
    assert.equal(await evaluate("document.querySelectorAll('#kv-sources .kv-source').length > 0"), true);
    await evaluate("document.querySelector('#kv-sources .kv-source').click()");
    assert.equal(await evaluate("!document.querySelector('#kv-modal').hidden"), true);
    await evaluate("document.querySelector('#kv-modal [data-kv-close]').click()");
    await checkLayout('knowledge-v2-desktop', 1440, 1080);
    await checkLayout('knowledge-v2-mobile', 390, 844);

    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    console.log('PASS: workbench -> incident-v2 deep dive, logs, notes, handover');
    console.log('PASS: knowledge-v2 documents, filter, streamed answer and recall source');
    console.log('PASS: desktop/mobile layout screenshots saved to ' + output);
    await command('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });