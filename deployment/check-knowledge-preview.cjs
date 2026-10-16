// Capture README previews only after a completed, grounded answer in a fresh session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aiops-knowledge-preview-'));
  const browser = spawn(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9936', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let tab;
    for (let i = 0; i < 80; i++) {
      try { tab = (await (await fetch('http://127.0.0.1:9936/json/list')).json()).find(t => t.type === 'page'); } catch {}
      if (tab) break;
      await pause(200);
    }
    assert(tab, 'Edge debugging endpoint unavailable');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      const task = pending.get(message.id);
      if (task) { pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
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
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: 'http://127.0.0.1:9900/designs/knowledge-v2.html' });
    for (let i = 0; i < 100; i++) {
      if (await evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length >= 5")) break;
      await pause(200);
    }
    assert(await evaluate("document.querySelectorAll('#kv-doc-list .kv-doc').length >= 5"), 'Knowledge documents unavailable');
    assert.equal(await evaluate('Boolean(window.__AIOPS_STATIC_DEMO__)'), false, 'Requires the real backend');
    await evaluate("document.querySelector('#kv-new-chat').click(); document.querySelector('#kv-form textarea').value='根据知识库，HighCPUUsage 告警的触发条件是什么？请简短说明阈值和持续时间。'; document.querySelector('#kv-form').requestSubmit()");
    let result;
    for (let i = 0; i < 480; i++) {
      result = await evaluate("({busy:document.querySelector('#kv-send').disabled, answer:document.querySelector('.kv-answer-text')?.textContent || '', turns:document.querySelectorAll('.kv-turn').length, sources:document.querySelectorAll('#kv-sources .kv-source').length, sourceText:document.querySelector('#kv-sources').textContent})");
      if (!result.busy && result.answer) break;
      await pause(500);
    }
    assert.equal(result.busy, false, 'Answer stream did not finish');
    assert.equal(result.turns, 1, 'Preview must contain exactly one fresh question');
    assert(result.sources > 0, 'No retrieved sources');
    assert((await evaluate("document.querySelector('.kv-answer-head').textContent")).includes('召回 ' + result.sources + ' 个片段'), 'Answer source count is stale');
    assert(!/请求未完成|知识库未命中|没有检索到|来自通用知识/.test(result.answer), 'Answer failed or fell back to general knowledge: ' + result.answer);
    assert(/80\s*[%％]/.test(result.answer) && /5\s*分钟|五分钟/.test(result.answer), 'Answer does not contain the documented threshold');
    assert(/80\s*[%％]/.test(result.sourceText), 'Visible sources do not support the threshold');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    const output = path.join(__dirname, 'v2-previews');
    for (const [name, width, height] of [['desktop', 1440, 1080], ['mobile', 390, 844]]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await evaluate("window.scrollTo(0,0); document.querySelector('#kv-chat')?.scrollTo(0,0)");
      await pause(500);
      assert(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2'), 'Horizontal layout overflow');
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `knowledge-v2-${name}-${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
    }
    console.log(JSON.stringify({ mode: 'real backend', ...result }, null, 2));
    await command('Browser.close');
  } finally { socket?.close(); browser.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
