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
        for(const width of [1440,1024,390]) {
            for(const page of ['workbench','incident','knowledge']) {
                await command('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:width===390});
                await command('Page.navigate',{url:'http://127.0.0.1:9900/designs/'+page+'.html'});await pause(1500);
                assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,page+' overflow at '+width);
                assert.equal(await evaluate("parseFloat(getComputedStyle(document.querySelector('.nav-item')).fontSize)>=13"),true);
                if(width===1440 || width===390)fs.writeFileSync(path.join(output,page+(width===390?'-mobile':'')+'.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
                console.log('PASS '+page+' at '+width+'px');
            }
        }
        assert.deepEqual(errors,[],'No browser runtime exceptions');
        console.log('PASS: all designs rendered without browser exceptions');
        await command('Browser.close');
    } finally {socket?.close();browser.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
