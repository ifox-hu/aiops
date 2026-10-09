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
    '--remote-debugging-port=9914', '--user-data-dir=D:/tools/superbizagent-config/v2-qa-profile',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let socket;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        tabs = await (await fetch('http://127.0.0.1:9914/json/list')).json();
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
    assert.equal(await evaluate("document.querySelector('#v2-focus-title').textContent.length > 0"), true);
    const layout = await evaluate(`(() => {
      const grid = document.querySelector('.v2-workgrid');
      const panels = [...grid.children];
      return {
        grid: getComputedStyle(grid).alignItems,
        heights: panels.map(panel => Math.round(panel.getBoundingClientRect().height)),
        bottoms: panels.map(panel => Math.round(panel.getBoundingClientRect().bottom)),
        classes: panels.map(panel => panel.className)
      };
    })()`);
    const bottoms = layout.bottoms;
    assert.equal(bottoms.length, 3, 'expected three primary workbench panels');
    assert(Math.max(...bottoms) - Math.min(...bottoms) <= 1, 'primary workbench panels are not bottom-aligned: ' + bottoms.join(', '));
    assert(parseFloat(await evaluate("getComputedStyle(document.body).fontSize")) >= 15, 'workbench base font size is too small');
    await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row')[1].click()");
    assert.equal(await evaluate("document.querySelectorAll('#v2-alert-list .v2-alert-row')[1].classList.contains('selected')"), true);
    await evaluate("document.querySelector('[data-tab=logs]').click()");
    for (let i = 0; i < 30; i++) {
      if (await evaluate("document.querySelectorAll('#v2-log .v2-log-line').length > 0")) break;
      await pause(200);
    }
    assert.equal(await evaluate("document.querySelectorAll('#v2-log .v2-log-line').length > 0"), true);
    await evaluate("document.querySelector('[data-tab=evidence]').click()");
    assert.equal(await evaluate("document.querySelectorAll('#v2-evidence-list .v2-evidence').length"), 3);
    await checkLayout('v2-desktop', 1440, 1080);
    await checkLayout('v2-mobile', 390, 844);
    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    console.log('PASS: workbench v2 loads alerts, switches alert, tabs and logs, and has no desktop/mobile overflow');
    console.log(`PASS: preview screenshots saved to ${output}`);
    await command('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });