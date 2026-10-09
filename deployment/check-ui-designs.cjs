// Uses installed Edge and its DevTools protocol. No npm or browser download needed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const output = path.join(__dirname,'ui-previews');
fs.mkdirSync(output,{recursive:true});
const pause = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
async function main() {
    const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
        '--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
        '--remote-debugging-port=9912','--user-data-dir=D:/tools/superbizagent-config/ui-qa-profile','about:blank'
    ],{windowsHide:true,stdio:'ignore'});
    let socket;
    try {
        let tabs;
        for(let attempt=0;attempt<60;attempt++) {try {tabs=await (await fetch('http://127.0.0.1:9912/json/list')).json();if(tabs.some(tab=>tab.type==='page'))break;}catch{}await pause(200);}
        assert(tabs,'Edge debugging endpoint unavailable');
        socket = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
        await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let id=0;const pending=new Map();const errors=[];
        socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);}}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);};
        function command(method,params={}) {return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
        async function evaluate(expression) {const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
        await command('Runtime.enable');await command('Page.enable');
        for(const design of ['workbench','incident','knowledge']) {
            await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
            await command('Page.navigate',{url:`http://127.0.0.1:9901/${design}.html`});
            for(let attempt=0;attempt<40;attempt++){if(await evaluate(`document.body.dataset.design==='${design}' && !!document.querySelector('main')`))break;await pause(100);}
            assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,`${design}: desktop overflow`);
            fs.writeFileSync(path.join(output,`${design}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
            if(design==='workbench') {
                await evaluate(`document.querySelector('[data-filter="P2"]').click()`);
                assert.equal(await evaluate(`document.querySelectorAll('[data-alert]').length`),2);
                await evaluate(`document.querySelector('[data-alert="ALT-1023"]').click()`);
                assert.equal(await evaluate(`document.getElementById('diagnosis-title').textContent`),'应用实例 CPU 持续偏高');
                await evaluate(`document.querySelector('[data-action="evidence"]').click()`);
                assert.equal(await evaluate(`document.querySelector('.modal').textContent.includes('不确定')`),true);
            } else if(design==='incident') {
                await evaluate(`document.querySelector('[data-action="logs"]').click()`);
                assert.equal(await evaluate(`document.querySelector('.modal').textContent.includes('pending threads')`),true);
            } else {
                await evaluate(`document.querySelector('[data-source="0"]').click()`);
                assert.equal(await evaluate(`document.querySelector('.modal').textContent.includes('数据库连接池排查指南')`),true);
                await evaluate(`document.querySelector('[data-action="close-modal"]').click();document.querySelector('[data-action="new-chat"]').click();document.querySelector('textarea').value='<img src=x onerror=alert(1)>';document.querySelector('[data-chat-form]').requestSubmit()`);
                assert.equal(await evaluate(`document.querySelector('#chat-scroll').querySelectorAll('img').length`),0,'Question must be escaped');
                assert.equal(await evaluate(`document.querySelector('#chat-scroll').textContent.includes('固定演示内容')`),true);
            }
            await evaluate(`document.querySelector('[data-action="close-modal"]')?.click()`);
            await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
            await command('Page.navigate',{url:`http://127.0.0.1:9901/${design}.html`});
            await pause(300);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,`${design}: mobile overflow`);
            fs.writeFileSync(path.join(output,`${design}-mobile.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
            console.log(`PASS ${design}: desktop/mobile layout and core interactions`);
        }
        assert.deepEqual(errors,[],'No browser runtime exceptions');
        console.log('PASS: all designs rendered without browser exceptions');
        await command('Browser.close');
    } finally {socket?.close();browser.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
