(function () {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const encoder = new TextEncoder();
  const now = Date.now();
  const isoAgo = minutes => new Date(now - minutes * 60 * 1000).toISOString();

  const alerts = [
    { alert_name: 'HighCPUUsage', state: 'firing', active_at: isoAgo(38), duration: '38m 12s', description: '\u670d\u52a1 order-service \u5728\u5b9e\u4f8b order-service-7f9c \u89e6\u53d1 HighCPUUsage\uff0c\u5f53\u524d\u503c\u4e3a 94.2%\uff0c\u53ef\u80fd\u539f\u56e0\uff1a\u6279\u5904\u7406\u4efb\u52a1\u6216\u8bf7\u6c42\u91cf\u7a81\u589e\u5bfc\u81f4 CPU \u6301\u7eed\u5360\u7528\u3002' },
    { alert_name: 'SlowResponse', state: 'firing', active_at: isoAgo(25), duration: '25m 08s', description: '\u670d\u52a1 order-service \u5728\u5b9e\u4f8b order-service-7f9c \u89e6\u53d1 SlowResponse\uff0c\u5f53\u524d\u503c\u4e3a 2.8 \u79d2\uff0c\u53ef\u80fd\u539f\u56e0\uff1a\u6570\u636e\u5e93\u8fde\u63a5\u6c60\u7b49\u5f85\u6216\u6162 SQL\u3002' },
    { alert_name: 'HighMemoryUsage', state: 'firing', active_at: isoAgo(12), duration: '12m 45s', description: '\u670d\u52a1 payment-service \u5728\u5b9e\u4f8b payment-service-58d4 \u89e6\u53d1 HighMemoryUsage\uff0c\u5f53\u524d\u503c\u4e3a 88.6%\uff0c\u53ef\u80fd\u539f\u56e0\uff1a\u5bf9\u8c61\u7f13\u5b58\u589e\u957f\u6216\u5185\u5b58\u6cc4\u6f0f\u3002' }
  ];

  const documents = [
    { name: 'cpu_high_usage.md', size: 6200, updatedAt: isoAgo(180) },
    { name: 'slow_response.md', size: 5800, updatedAt: isoAgo(180) },
    { name: 'memory_high_usage.md', size: 5100, updatedAt: isoAgo(180) },
    { name: 'disk_high_usage.md', size: 4900, updatedAt: isoAgo(180) },
    { name: 'service_unavailable.md', size: 5300, updatedAt: isoAgo(180) }
  ];

  const documentContent = {
    'cpu_high_usage.md': '# CPU \u4f7f\u7528\u7387\u8fc7\u9ad8\u6392\u67e5\n\n1. \u786e\u8ba4\u5b9e\u4f8b\u3001\u5bb9\u5668\u548c\u65f6\u95f4\u7a97\u53e3\u3002\n2. \u5bf9\u6bd4\u8bf7\u6c42\u91cf\u3001\u7ebf\u7a0b\u6570\u4e0e GC \u6307\u6807\u3002\n3. \u68c0\u67e5\u6279\u5904\u7406\u4efb\u52a1\u3001\u70ed\u70b9\u7ebf\u7a0b\u548c\u6700\u8fd1\u53d1\u5e03\u3002',
    'slow_response.md': '# \u670d\u52a1\u54cd\u5e94\u53d8\u6162\u6392\u67e5\n\n1. \u5bf9\u9f50\u7f51\u5173\u3001\u5e94\u7528\u548c\u6570\u636e\u5e93\u8017\u65f6\u3002\n2. \u68c0\u67e5\u8fde\u63a5\u6c60 active\u3001idle\u3001pending\u3002\n3. \u5206\u6790\u6162 SQL\u3001\u9501\u7b49\u5f85\u548c\u7f51\u7edc\u91cd\u8bd5\u3002',
    'memory_high_usage.md': '# \u5185\u5b58\u4f7f\u7528\u7387\u8fc7\u9ad8\u6392\u67e5\n\n1. \u533a\u5206\u5806\u5185\u5b58\u3001\u975e\u5806\u5185\u5b58\u548c\u5bb9\u5668\u9650\u5236\u3002\n2. \u89c2\u5bdf Full GC \u6b21\u6570\u4e0e\u56de\u6536\u6548\u679c\u3002\n3. \u68c0\u67e5\u7f13\u5b58\u5bb9\u91cf\u3001\u5bf9\u8c61\u589e\u957f\u548c\u6279\u5904\u7406\u3002',
    'disk_high_usage.md': '# \u78c1\u76d8\u4f7f\u7528\u7387\u8fc7\u9ad8\u6392\u67e5\n\n1. \u5b9a\u4f4d\u589e\u957f\u6700\u5feb\u7684\u6302\u8f7d\u70b9\u548c\u76ee\u5f55\u3002\n2. \u68c0\u67e5\u65e5\u5fd7\u8f6e\u8f6c\u3001\u4e34\u65f6\u6587\u4ef6\u548c\u955c\u50cf\u7f13\u5b58\u3002',
    'service_unavailable.md': '# \u670d\u52a1\u4e0d\u53ef\u7528\u6392\u67e5\n\n1. \u68c0\u67e5\u5b9e\u4f8b\u5b58\u6d3b\u3001\u7aef\u53e3\u76d1\u542c\u548c\u6ce8\u518c\u72b6\u6001\u3002\n2. \u6838\u5bf9\u4f9d\u8d56\u670d\u52a1\u3001\u914d\u7f6e\u548c\u6700\u8fd1\u53d8\u66f4\u3002'
  };

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }

  function stream(events, interval = 60) {
    return new Response(new ReadableStream({
      start(controller) {
        let index = 0;
        let timer;
        let cancelled = false;
        const push = () => {
          if (cancelled) return;
          if (index >= events.length) { try { controller.close(); } catch {} return; }
          try {
            controller.enqueue(encoder.encode('data: ' + JSON.stringify(events[index++]) + '\n\n'));
          } catch {
            cancelled = true;
            return;
          }
          timer = setTimeout(push, interval);
        };
        push();
        return () => { cancelled = true; clearTimeout(timer); };
      }
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
  }

  function bodyOf(init) {
    try { return JSON.parse(init.body || '{}'); } catch { return {}; }
  }

  function selectedAlert(question) {
    return alerts.find(alert => question.includes(alert.alert_name)) || alerts[0];
  }

  function diagnosisReport(alert) {
    return [
      '# ' + alert.alert_name + ' \u6545\u969c\u8bca\u65ad\u62a5\u544a',
      '',
      '> \u6570\u636e\u6765\u6e90\uff1aGitHub Pages \u5185\u7f6e Mock API\u3002\u4ee5\u4e0b\u5185\u5bb9\u4ec5\u7528\u4e8e\u9759\u6001\u6f14\u793a\u3002',
      '',
      '## \u89c2\u6d4b\u4e8b\u5b9e',
      '- \u6301\u7eed\u65f6\u95f4\uff1a' + alert.duration,
      '- \u539f\u59cb\u63cf\u8ff0\uff1a' + alert.description,
      '',
      '## \u5019\u9009\u539f\u56e0',
      '- \u8bf7\u6c42\u91cf\u6216\u6279\u5904\u7406\u4efb\u52a1\u5bfc\u81f4\u8d44\u6e90\u6301\u7eed\u5360\u7528\u3002',
      '- \u8fde\u63a5\u6c60\u7b49\u5f85\u3001\u6162 SQL \u6216\u4e0b\u6e38\u4f9d\u8d56\u5ef6\u8fdf\u3002',
      '',
      '## \u5efa\u8bae\u6392\u67e5\u987a\u5e8f',
      '1. \u5bf9\u9f50\u544a\u8b66\u65f6\u95f4\u7a97\u53e3\u5185\u7684\u6307\u6807\u3001\u65e5\u5fd7\u548c\u53d1\u5e03\u8bb0\u5f55\u3002',
      '2. \u9a8c\u8bc1\u5019\u9009\u539f\u56e0\u540e\u518d\u51b3\u5b9a\u6269\u5bb9\u3001\u56de\u6eda\u6216\u53c2\u6570\u8c03\u6574\u3002'
    ].join('\n');
  }

  function knowledgeAnswer(question) {
    if (question.includes('\u8fde\u63a5\u6c60')) return '\u8fde\u63a5\u6c60\u662f\u5e94\u7528\u4e0e\u6570\u636e\u5e93\u4e4b\u95f4\u590d\u7528\u8fde\u63a5\u7684\u7f13\u51b2\u533a\u3002\u9700\u8981\u540c\u65f6\u89c2\u5bdf active\u3001idle\u3001pending\u3001\u8d85\u65f6\u6b21\u6570\u548c\u6162 SQL\u3002';
    if (/CPU|cpu/i.test(question)) return 'CPU \u6301\u7eed\u8fc7\u9ad8\u65f6\uff0c\u5efa\u8bae\u5148\u786e\u8ba4\u5b9e\u4f8b\u548c\u65f6\u95f4\u7a97\u53e3\uff0c\u518d\u5bf9\u6bd4\u8bf7\u6c42\u91cf\u3001\u7ebf\u7a0b\u6570\u3001GC\u3001\u70ed\u70b9\u4efb\u52a1\u548c\u6700\u8fd1\u53d1\u5e03\u3002';
    return '\u9759\u6001\u6f14\u793a\u4f1a\u6839\u636e\u95ee\u9898\u8fd4\u56de\u4e00\u6bb5\u8fd0\u7ef4\u77e5\u8bc6\u8bf4\u660e\u3002\u6b63\u5f0f\u73af\u5883\u53ef\u4ee5\u66ff\u6362\u4e3a\u771f\u5b9e RAG \u68c0\u7d22\u4e0e\u6a21\u578b\u56de\u7b54\u3002';
  }

  function knowledgeSources() {
    return [
      { id: 'mock-source-1', metadata: JSON.stringify({ _file_name: 'cpu_high_usage.md' }), content: documentContent['cpu_high_usage.md'], score: '0.1842' },
      { id: 'mock-source-2', metadata: JSON.stringify({ _file_name: 'slow_response.md' }), content: documentContent['slow_response.md'], score: '0.3176' }
    ];
  }

  function logsFor(topic) {
    return [
      { timestamp: new Date(now - 300000).toLocaleTimeString('zh-CN', { hour12: false }), level: 'WARN', service: 'order-service', instance: 'order-service-7f9c', message: topic === 'database-slow-query' ? 'connection wait time exceeded 1200ms' : 'cpu load above 90% for 5 minutes' },
      { timestamp: new Date(now - 180000).toLocaleTimeString('zh-CN', { hour12: false }), level: 'INFO', service: 'order-service', instance: 'order-service-7f9c', message: 'health check passed, pending requests increased' },
      { timestamp: new Date(now - 60000).toLocaleTimeString('zh-CN', { hour12: false }), level: 'ERROR', service: 'order-service', instance: 'order-service-7f9c', message: 'request timeout while waiting for downstream dependency' }
    ];
  }

  window.__AIOPS_STATIC_DEMO__ = true;
  window.fetch = function (input, init) {
    const options = init || {};
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const apiIndex = url.pathname.indexOf('/api/');
    if (apiIndex < 0) return nativeFetch(input, options);
    const path = url.pathname.slice(apiIndex);
    const method = String(options.method || (input && input.method) || 'GET').toUpperCase();
    if (path === '/api/platform/alerts') return Promise.resolve(json({ alerts, mock: true, updatedAt: new Date().toISOString() }));
    if (path === '/api/platform/documents') return Promise.resolve(json(documents));
    if (path === '/api/platform/documents/content') return Promise.resolve(json({ content: documentContent[url.searchParams.get('name')] || '\u9759\u6001\u6f14\u793a\u6587\u6863\u3002' }));
    if (path === '/api/platform/logs') return Promise.resolve(json({ mock: true, result: { logs: logsFor(url.searchParams.get('topic') || '') } }));
    if (path === '/api/upload') return Promise.resolve(json({ code: 200, message: '\u9759\u6001\u6f14\u793a\u6a21\u5f0f\uff1a\u4e0a\u4f20\u63a5\u53e3\u5df2\u8fd4\u56de\u6a21\u62df\u7ed3\u679c\u3002' }));
    if (path === '/api/platform/knowledge/stream' && method === 'POST') {
      const body = bodyOf(options);
      const events = [];
      if (body.mode !== 'general') events.push({ type: 'sources', data: knowledgeSources() });
      knowledgeAnswer(body.question || '').match(/.{1,18}/g).forEach(chunk => events.push({ type: 'content', data: chunk }));
      events.push({ type: 'done', data: '' });
      return Promise.resolve(stream(events));
    }
    if (path === '/api/chat_stream' && method === 'POST') {
      const report = diagnosisReport(selectedAlert(bodyOf(options).Question || ''));
      const events = report.match(/.{1,24}/gs).map(chunk => ({ type: 'content', data: chunk }));
      events.push({ type: 'done', data: '' });
      return Promise.resolve(stream(events));
    }
    return Promise.resolve(json({ code: 404, message: 'Mock API not implemented: ' + path }, 404));
  };
})();
