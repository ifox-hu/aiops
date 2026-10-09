const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/main/resources/static/app.js', 'utf8');
const context = { console: { log() {}, error() {} }, AbortController, TextDecoder, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(source.split('const style = document.createElement')[0] + '\nthis.App = SuperBizAgentApp;', context);

function app() {
    const instance = Object.create(context.App.prototype);
    Object.assign(instance, { apiBaseUrl: '/api', sessionId: 'test', requestTimeoutMs: 15, messages: [], loaders: [] });
    instance.addLoadingMessage = () => {
        const node = { removed: false, remove() { this.removed = true; } };
        instance.loaders.push(node);
        return node;
    };
    instance.addMessage = (type, text) => {
        const node = { text, hidden: false, removed: false, remove() { this.removed = true; }, querySelector() { return { innerHTML: '' }; } };
        instance.messages.push(node);
        return node;
    };
    instance.renderMarkdown = text => text;
    instance.highlightCodeBlocks = instance.scrollToBottom = () => {};
    instance.handleStreamComplete = (node, text) => { node.text = text; node.completed = true; };
    return instance;
}

async function main() {
    // A server that never sends headers must leave a usable UI after the deadline.
    for (const method of ['sendQuickMessage', 'sendStreamMessage']) {
        const instance = app();
        context.fetch = (_, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        await assert.rejects(instance[method]('你好'), /两分钟/);
        assert(instance.loaders.every(node => node.removed));
    }
    // Test a real SSE-shaped sequence, including finalization and cleanup.
    const instance = app();
    const chunks = ['data:{"type":"content","data":"你好"}\n\n', 'data:{"type":"done","data":""}\n\n'];
    context.fetch = async (url, options) => {
        assert.equal(url, '/api/chat_stream');
        assert(options.signal);
        return { ok: true, body: { getReader: () => ({
            read: async () => chunks.length ? { done: false, value: Buffer.from(chunks.shift()) } : { done: true },
            releaseLock() {}
        }) } };
    };
    await instance.sendStreamMessage('你好');
    assert.equal(instance.messages[0].text, '你好');
    assert.equal(instance.messages[0].completed, true);
    assert.equal(instance.messages[0].hidden, false);
    assert(instance.loaders.every(node => node.removed));

    const failed = app();
    context.fetch = async () => ({ ok: false, status: 502 });
    await assert.rejects(failed.sendStreamMessage('你好'), /502/);
    assert(failed.loaders.every(node => node.removed));
    assert.equal(failed.messages.length, 0);
    console.log('PASS: quick/stream timeout cleanup, streamed content/done, HTTP failure cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
