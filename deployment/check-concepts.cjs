const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const output = path.join(__dirname, 'concept-previews');
fs.mkdirSync(output, { recursive: true });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9913', '--user-data-dir=D:/tools/superbizagent-config/concept-qa-profile',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let socket;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        tabs = await (await fetch('http://127.0.0.1:9913/json/list')).json();
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
    async function visit(url) {
      await command('Page.navigate', { url: `http://127.0.0.1:9900/concepts/${url}` });
      await pause(900);
    }
    async function checkLayout(name, width, height) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await pause(300);
      const result = await evaluate(`(() => {
        const body = document.body;
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const visible = [...document.querySelectorAll('h1,h2,h3,p,button,a')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const clipped = visible.filter(el => {
          const style = getComputedStyle(el);
          return el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'visible' && style.overflowX !== 'visible';
        }).map(el => (el.textContent || el.tagName).trim().slice(0, 50));
        return { overflow, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, clipped };
      })()`);
      assert(result.overflow <= 2, `${name} ${width}x${height} horizontal overflow ${result.overflow}`);
      assert.deepEqual(result.clipped, [], `${name} ${width}x${height} clipped text: ${result.clipped.join(' | ')}`);
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${name}-${width}x${height}.png`), Buffer.from(image.data, 'base64'));
    }

    await command('Runtime.enable');
    await command('Page.enable');

    await visit('index.html');
    assert.equal(await evaluate("document.querySelectorAll('.board-item').length"), 3);
    await checkLayout('board', 1440, 1080);
    await checkLayout('board-mobile', 390, 844);

    await visit('signal.html');
    await evaluate("document.querySelector('[data-signal=pool]').click()");
    assert.equal(await evaluate("document.querySelector('[data-focus-title]').textContent"), '数据库连接池等待时间升高');
    const commandInput = await evaluate("document.querySelector('#signal-command') !== null");
    assert.equal(commandInput, true);
    await checkLayout('signal', 1440, 1080);
    await checkLayout('signal-mobile', 390, 844);

    await visit('casebook.html');
    await evaluate("document.querySelectorAll('.casebook-exhibit')[1].click()");
    assert.equal(await evaluate("document.querySelectorAll('.casebook-exhibit')[1].classList.contains('expanded')"), true);
    await checkLayout('casebook', 1440, 1080);
    await checkLayout('casebook-mobile', 390, 844);

    await visit('atlas.html');
    await evaluate("document.querySelector('[data-atlas-prompt]').click(); document.querySelector('[data-atlas-form]').requestSubmit()");
    await pause(300);
    assert.equal(await evaluate("document.querySelectorAll('.atlas-question').length"), 2);
    assert.equal(await evaluate("document.querySelectorAll('.atlas-answer').length"), 2);
    await evaluate("document.querySelector('[data-atlas-node=sql]').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
    assert.equal(await evaluate("document.querySelector('[data-atlas-label] strong').textContent"), '慢 SQL');
    await checkLayout('atlas', 1440, 1080);
    await checkLayout('atlas-mobile', 390, 844);

    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    console.log('PASS: concepts render, interactions work, desktop/mobile layouts have no horizontal overflow or clipped text');
    console.log(`PASS: preview screenshots saved to ${output}`);
    await command('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });