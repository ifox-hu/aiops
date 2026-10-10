'use strict';
window.platformLive = true;
let documents = [], sources = [], report = '', busy = false;
let conversation = [];
let sessionId = sessionStorage.getItem('aiops-session') || crypto.randomUUID();
sessionStorage.setItem('aiops-session',sessionId);
const storageKey = 'aiops-report';
try { report = sessionStorage.getItem(storageKey) || ''; } catch {}
const api = async (url,options={}) => {
    const response = await fetch(url,{...options,signal:options.signal || AbortSignal.timeout(120000)});
    if(!response.ok) throw new Error(`请求失败（${response.status}），请检查服务后重试`);
    return response.json();
};
function sourceName(source) {
    try {return JSON.parse(source.metadata || '{}')._file_name || source.id;} catch {return source.id || '检索片段';}
}
async function stream(url,body,onEvent,timeoutMs=120000) {
    const controller = new AbortController();
    let timer;
    const reset = () => {clearTimeout(timer);timer=setTimeout(()=>controller.abort(),timeoutMs);};reset();
    let reader;
    try {
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
        if(!response.ok) throw new Error(`请求失败（${response.status}）`);
        reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',complete=false;
        while(!complete) {
            const {done,value}=await reader.read();if(done)break;reset();buffer+=decoder.decode(value,{stream:true});
            const lines=buffer.split('\n');buffer=lines.pop();
            for(const line of lines) {
                if(!line.startsWith('data:'))continue;
                const event=JSON.parse(line.slice(5));
                if(event.type==='error')throw new Error(event.data || '服务处理失败');
                onEvent(event);if(event.type==='done')complete=true;
            }
        }
        if(!complete)throw new Error('响应中断，请重试');
    } catch(error) {throw new Error(controller.signal.aborted ? '服务响应超时，请稍后重试' : error.message);}
    finally {clearTimeout(timer);await reader?.cancel().catch(()=>{});reader?.releaseLock();controller.abort();}
}
function reportView(title='诊断报告') {
    if(!report){toast('尚无报告，请先开始智能诊断');return;}
    modal(title,`<p style="white-space:pre-wrap" id="live-report">${escapeHtml(report)}</p><div class="modal-actions">${button('导出 Markdown','export',true)}</div>`);
}
actions.report=()=>reportView();
actions.export=()=>{
    if(!report){toast('没有可导出的诊断报告');return;}
    const url=URL.createObjectURL(new Blob([report],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='AIOps-诊断报告.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
actions.diagnose=async()=>{
    if(busy)return;busy=true;
    const nodes=[...document.querySelectorAll('[data-action="diagnose"]')];nodes.forEach(node=>node.disabled=true);
    report='';sessionStorage.removeItem(storageKey);modal('正在分析告警',`<p id="live-report" role="status">正在连接模型与运维工具…</p>`);
    const alert=selectedAlert;
    const prompt=`请针对以下告警调用运维工具进行诊断，生成 Markdown 报告，区分观测事实、根因假设、待验证项和排查建议，不执行变更。告警信息：${JSON.stringify(alert)}。页面标识的数据来源：${document.body.dataset.mock==='true'?'模拟告警，必须明确标注':'配置的告警服务'}。只根据工具返回内容，不编造指标、时间线或概率。`;
    try {
        await stream('/api/chat_stream',{Id:'diagnosis-'+crypto.randomUUID(),Question:prompt},event=>{
            if(event.type==='content')report+=event.data || '';
            const output=document.getElementById('live-report');if(output)output.textContent=report || '工具执行中，等待诊断结果…';
        },180000);
        if(!report.trim())throw new Error('模型未返回诊断内容');
        sessionStorage.setItem(storageKey,report);
        document.getElementById('diagnosis-detail')?.replaceChildren(document.createTextNode(report));
        reportView('告警诊断完成');
    } catch(error) {if(report)report+='\n\n[分析未完成] '+error.message;modal('诊断未完成',`<p>${escapeHtml(error.message)}</p><p>${escapeHtml(report)}</p>`);}
    finally{busy=false;nodes.forEach(node=>node.disabled=false);}
};
actions.evidence=()=>modal('告警数据与诊断依据',`<p>${escapeHtml(selectedAlert?.detail || '暂无告警')}</p><p>告警来源：${document.body.dataset.mock==='true'?'后端模拟数据':'配置的 Prometheus 服务'}。诊断报告中的工具返回内容是分析依据；尚未返回独立的工具执行轨迹，不展示固定评分。</p><div class="modal-actions">${button('查看实际日志','logs')}${button('查看诊断报告','report')}</div>`);
actions.logs=async()=>{
    modal('查询日志', '<p>正在查询后端日志工具…</p>');
    try {const data=await api('/api/platform/logs');modal('日志查询结果',`<span class="pill">${data.mock?'模拟日志':'日志服务'}</span><p>${escapeHtml(JSON.stringify(data.result,null,2))}</p>`);}catch(error){modal('日志查询失败',`<p>${escapeHtml(error.message)}</p>`);}
};
function documentRows(){return documents.map((doc,index)=>`<div class="doc-row"><span class="doc-icon">MD</span><div class="doc-copy"><strong>${escapeHtml(doc.name)}</strong><small>${Math.ceil(doc.size/1024)} KB · 已上传</small></div><button class="text-btn" data-document="${index}">查看 ↗</button></div>`).join('') || '<p style="padding:20px">暂无文档，请上传 Markdown 或 TXT 文件。</p>';}
actions['nav-knowledge']=()=>modal('知识文档',`${documentRows()}<div class="modal-actions">${button('上传并索引','upload',true,'upload')}</div>`);
actions.upload=()=>modal('上传知识文档',`<p>支持 Markdown / TXT。上传后由本地向量服务创建索引。</p><input type="file" id="live-file" accept=".md,.markdown,.txt" aria-label="选择知识文档"><p id="upload-status" role="status">请选择文件</p>`);
actions.about=()=>modal('AIOps 智能运维与知识助手平台',`<p>本项目由本人独立开发，使用 Apache-2.0 许可。</p><p>已接入告警查询、日志工具、Agent 诊断、Milvus 文档检索与流式问答。告警和日志是否模拟由后端配置决定。未接入真实生产指标、自动变更或持久化会话数据库。</p>`);
sourceModal=index=>{const source=sources[index];if(source)modal(sourceName(source),`<span class="pill">实际召回片段</span><p>${escapeHtml(source.content)}</p><p>向量距离：${source.score}（L2 距离，不代表可信度）</p>`);};
function currentAnswerMode(){return document.querySelector('[data-answer-mode][aria-pressed="true"]')?.dataset.answerMode || 'knowledge';}
function renderSources(){
    const pane=document.querySelector('.sources-pane');if(!pane)return;
    if(currentAnswerMode()==='general'){
        pane.innerHTML=`<h2>通用问答</h2><p class="muted">未检索知识库，回答来自模型通用知识</p>${sources.length?`<button class="source-card" data-source="0"><span class="source-index">KNOWLEDGE</span><h3>本次回答未使用知识库来源</h3><p>切换为“知识库优先”可按已上传文档检索并展示引用。</p></button>`:''}`;
        return;
    }
    pane.innerHTML=`<h2>本次检索来源</h2><p class="muted">实际召回片段，不代表每个片段均被答案引用</p>${sources.map((source,index)=>`<button class="source-card" data-source="${index}"><span class="source-index">SOURCE ${index+1}</span><h3>${escapeHtml(sourceName(source))}</h3><p>${escapeHtml(source.content.slice(0,130))}…</p><div class="source-meta">L2 距离 ${source.score} · 查看片段 ↗</div></button>`).join('') || '<p class="muted" style="margin-top:20px">尚无检索结果</p>'}`;
}
actions['new-chat']=()=>{
    if(busy){toast('请等待当前请求完成');return;}
    conversation=[];sources=[];sessionId=crypto.randomUUID();sessionStorage.setItem('aiops-session',sessionId);
    document.getElementById('chat-scroll').innerHTML='<div class="result-box"><h3>新的知识问答</h3><p>上传文档后，输入问题开始检索。</p></div>';renderSources();
};
actions.history=()=>toast('当前仅支持本页会话，后端重启后会话历史清空');
actions['view-sources']=()=>currentAnswerMode()==='general'?modal('通用问答来源','<p>通用问答不会检索知识库，回答来自模型已有知识。若需要文档依据，请切换到“知识库优先”。</p>'):modal('本次检索来源',sources.map((source,index)=>`<button class="source-card" data-source="${index}"><h3>${escapeHtml(sourceName(source))}</h3><p>${escapeHtml(source.content.slice(0,180))}</p></button>`).join('') || '<p>尚无检索来源</p>');
document.addEventListener('change',async event=>{
    if(event.target.id!=='live-file')return;
    const file=event.target.files[0];if(!file)return;
    const output=document.getElementById('upload-status');output.textContent='正在上传并创建向量索引…';event.target.disabled=true;
    try{const body=new FormData();body.append('file',file);const result=await api('/api/upload',{method:'POST',body});if(result.code!==200)throw new Error(result.message);documents=await api('/api/platform/documents');output.textContent='上传与索引完成：'+file.name;toast('文档已加入知识库');}
    catch(error){output.textContent=error.message;}finally{event.target.disabled=false;}
});
document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-document]');if(!target)return;
    try{const doc=documents[Number(target.dataset.document)];const result=await api('/api/platform/documents/content?name='+encodeURIComponent(doc.name));modal(doc.name,`<p>${escapeHtml(result.content)}</p>`);}catch(error){toast(error.message);}
});
document.addEventListener('click',event=>{
    const target=event.target.closest('[data-answer-mode]');if(!target)return;
    if(busy){toast('请等待当前回答完成');return;}
    document.querySelectorAll('[data-answer-mode]').forEach(node=>{node.classList.toggle('active',node===target);node.setAttribute('aria-pressed',String(node===target));});
    const general=target.dataset.answerMode==='general';
    sources=[];renderSources();
    const note=document.querySelector('.composer-note');
    const input=document.querySelector('textarea[name="question"]');
    if(note)note.textContent=general?'通用问答不检索知识库 · 事实性内容请自行核验':'基于实际检索内容生成 · 请结合现场证据核验';
    if(input)input.placeholder=general?'输入通用问题，例如“什么是 TCP 三次握手？”':'描述你的问题，或补充日志与故障现象…';
    toast(general?'已切换到通用问答':'已切换到知识库优先');
});
document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-chat-form]');if(!form)return;event.preventDefault();
    const question=form.elements.question.value.trim();if(!question)return;
    if(DESIGN!=='knowledge'){sessionStorage.setItem('aiops-question',question);location.href='knowledge.html';return;}
    if(busy){toast('请等待当前回答完成');return;}busy=true;
    const chat=document.getElementById('chat-scroll');chat.insertAdjacentHTML('beforeend',`<article class="user-question"><p>${escapeHtml(question)}</p></article>`);
    const answer=document.createElement('article');answer.className='assistant-answer';answer.innerHTML='<div class="answer-header"><span class="ai-badge">AI</span>知识助手</div><div class="answer-text" style="white-space:pre-wrap" role="status">正在生成回答…</div>';chat.append(answer);
    const output=answer.querySelector('.answer-text');const submit=form.querySelector('[type="submit"]');submit.disabled=true;form.elements.question.value='';let full='';sources=[];renderSources();
    const mode=document.querySelector('[data-answer-mode][aria-pressed="true"]')?.dataset.answerMode || 'knowledge';
    try{await stream('/api/platform/knowledge/stream',{question,history:conversation,mode},event=>{
        if(event.type==='sources'){sources=event.data;renderSources();if(mode==='knowledge')output.textContent='已检索 '+sources.length+' 个片段，等待模型回答…';}
        if(event.type==='content')full+=event.data || '';
        if(event.type==='done' && !full)full=event.data || '';
        if(full)output.textContent=full;chat.scrollTop=chat.scrollHeight;
    });if(!full)throw new Error('模型没有返回内容');conversation.push({role:'user',content:question},{role:'assistant',content:full});conversation=conversation.slice(-12);}
    catch(error){output.textContent=(full?full+'\n\n':'')+'请求未完成：'+error.message;}
    finally{busy=false;submit.disabled=false;chat.scrollTop=chat.scrollHeight;}
});
async function initializePlatform(){
    document.querySelectorAll('.top-actions .pill').forEach(node=>{node.textContent='已连接后端 · 状态加载中';});
    document.querySelectorAll('.footer').forEach(node=>{node.innerHTML='<span>本人独立开发 · Apache-2.0</span><span>模型诊断仅提供建议，不执行系统变更</span>';});
    if(DESIGN==='knowledge'){
        document.getElementById('chat-scroll').innerHTML='<div class="result-box"><h3>运维知识问答</h3><p>输入问题，从已上传文档中检索依据并生成回答。</p></div>';
        document.querySelectorAll('.history-caption,.history-item').forEach(node=>node.remove());
        document.querySelector('.composer-note').textContent='基于实际检索内容生成 · 请结合现场证据核验';
        document.querySelector('.composer-tools .pill')?.remove();
        document.querySelector('.composer-tools').insertAdjacentHTML('afterbegin','<div class="mode-switch" role="group" aria-label="回答模式"><button type="button" class="mode-option active" data-answer-mode="knowledge" aria-pressed="true">知识库优先</button><button type="button" class="mode-option" data-answer-mode="general" aria-pressed="false">通用问答</button></div><button type="button" class="text-btn" data-action="view-sources">查看来源</button>');renderSources();
        const question=sessionStorage.getItem('aiops-question');if(question){document.querySelector('textarea').value=question;sessionStorage.removeItem('aiops-question');}
    }
    try{
        const [data,files]=await Promise.all([api('/api/platform/alerts'),api('/api/platform/documents')]);documents=files;document.body.dataset.mock=String(data.mock);
        document.querySelectorAll('.top-actions .pill').forEach(node=>node.textContent=data.mock?'后端已连接 · 模拟告警':'后端已连接 · Prometheus');
        alerts.splice(0,alerts.length,...data.alerts.map(item=>({id:item.alert_name,level:'未分级',title:item.alert_name,service:item.state,metric:item.description,time:new Date(item.active_at).toLocaleTimeString(),root:'待诊断',detail:item.description})));
        selectedAlert=alerts.find(item=>item.id===sessionStorage.getItem('aiops-alert')) || alerts[0];
        if(DESIGN==='workbench'){
            document.getElementById('alert-list').innerHTML=alertRows();document.querySelector('.section-row').innerHTML='<span class="muted" style="font-size:11px">后端未返回严重等级 · 当前展示全部活动告警</span>';
            document.querySelectorAll('.stat-value')[0].innerHTML=`${alerts.length}<small>条</small>`;document.querySelectorAll('.stat-foot')[0].textContent='来源：'+(data.mock?'后端模拟告警':'Prometheus');
            document.querySelectorAll('.stat-value')[1].innerHTML=`${files.length}<small>篇</small>`;document.querySelectorAll('.stat-label')[1].textContent='已上传知识文档';
            document.querySelectorAll('.stat-value')[2].textContent='—';document.querySelectorAll('.stat-foot')[2].textContent='诊断后查看工具返回依据';
            document.querySelectorAll('.stat-value')[3].textContent='—';document.querySelectorAll('.stat-foot')[3].textContent='尚未接入时序指标接口';document.querySelector('.spark')?.remove();
            document.getElementById('diagnosis-title').textContent=selectedAlert?.title || '暂无活动告警';document.getElementById('diagnosis-root').textContent='待诊断';document.getElementById('diagnosis-detail').textContent=selectedAlert?.detail || '无需处理';
            document.querySelector('.steps').textContent='点击开始智能诊断，查询工具并生成报告';document.querySelector('.work-grid .panel:nth-child(2) .pill').textContent='尚未分析';
            document.querySelector('.work-grid .panel:first-child .panel-head .muted').textContent='更新于 '+new Date(data.updatedAt).toLocaleTimeString();
            document.querySelector('.work-grid .panel:first-child .panel-head .pill').textContent=alerts.length;
            document.querySelector('.panel-bottom').innerHTML='<span>选择告警后查看详情或开始诊断</span>';
            document.querySelector('.diagnosis-actions').insertAdjacentHTML('beforeend',button('故障详情','detail'));
            const docPanel=document.querySelector('.lower-grid .panel:first-child');docPanel.querySelectorAll('.doc-row').forEach(node=>node.remove());docPanel.insertAdjacentHTML('beforeend',documentRows());
            document.querySelector('.evidence-link').innerHTML='查看告警依据 ↗';
        }
        if(DESIGN==='incident'){
            const main=document.querySelector('.incident-content');
            main.innerHTML=`<div class="page-heading"><div><div class="eyebrow">INCIDENT DETAIL</div><h1>${escapeHtml(selectedAlert?.title || '暂无活动告警')}</h1><p>${escapeHtml(selectedAlert?.detail || '')}</p></div><div class="heading-actions">${button('开始诊断','diagnose',true,'pulse')}${button('导出报告','export',false,'file')}</div></div><div class="work-grid"><section class="panel"><div class="panel-head"><h2>告警事实</h2><span class="pill">${data.mock?'模拟告警':'Prometheus'}</span></div><div class="diagnosis-body"><p>${escapeHtml(selectedAlert?.detail || '暂无告警')}</p><p class="muted" style="margin-top:15px">未提供时序指标或发布事件，不展示推测的趋势和时间线。</p><div class="diagnosis-actions">${button('查询日志','logs')}${button('知识文档','nav-knowledge')}</div></div></section><section class="panel"><div class="panel-head"><h2>诊断报告</h2></div><div class="diagnosis-body"><p id="diagnosis-detail" style="white-space:pre-wrap">${escapeHtml(report || '尚无报告，点击开始诊断。')}</p></div></section></div>`;
        }
    }catch(error){document.querySelectorAll('.top-actions .pill').forEach(node=>node.textContent='后端连接失败');if(DESIGN==='workbench'){document.getElementById('alert-list').textContent='告警加载失败，请刷新重试';document.querySelector('.stats').hidden=true;document.getElementById('diagnosis-detail').textContent='暂无后端数据';}toast(error.message);}
}
actions.detail=()=>{if(selectedAlert)sessionStorage.setItem('aiops-alert',selectedAlert.id);location.href='incident.html';};
initializePlatform();
