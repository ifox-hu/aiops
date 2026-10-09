package org.example.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.agent.tool.QueryMetricsTools;
import org.example.agent.tool.QueryLogsTools;
import org.example.service.RagService;
import org.example.service.VectorSearchService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Platform view data and RAG sources. Mock status is explicitly returned to the UI. */
@RestController
@RequestMapping("/api/platform")
public class PlatformController {
    @Autowired private QueryMetricsTools metrics;
    @Autowired(required=false) private QueryLogsTools logs;
    @Autowired private RagService rag;
    @Autowired private ObjectMapper mapper;
    @Value("${prometheus.mock-enabled:false}") private boolean mockMetrics;
    @Value("${cls.mock-enabled:false}") private boolean mockLogs;
    @Value("${file.upload.path}") private String uploadPath;

    @GetMapping("/alerts")
    public Map<String,Object> alerts() throws Exception {
        JsonNode result = mapper.readTree(metrics.queryPrometheusAlerts());
        if (!result.path("success").asBoolean()) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "告警查询失败");
        return Map.of("mock",mockMetrics,"alerts",result.path("alerts"),"updatedAt",java.time.Instant.now().toString());
    }

    @GetMapping("/logs")
    public Map<String,Object> logs(@RequestParam(defaultValue="application-logs") String topic,
                                  @RequestParam(defaultValue="") String query) throws Exception {
        if (logs == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"日志查询未配置");
        return Map.of("mock",mockLogs,"result",mapper.readTree(logs.queryLogs("ap-guangzhou",topic,query,20)));
    }

    @GetMapping("/documents")
    public List<Map<String,Object>> documents() throws Exception {
        Path root=Paths.get(uploadPath).toAbsolutePath().normalize();
        if (!Files.exists(root)) return List.of();
        try(var files=Files.list(root)) {
            List<Map<String,Object>> result=new ArrayList<>();
            for(Path file:files.filter(Files::isRegularFile).sorted().toList()) {
                String name=file.getFileName().toString();
                if(name.toLowerCase().matches(".*\\.(md|markdown|txt)$"))
                    result.add(Map.of("name",name,"size",Files.size(file),"updatedAt",Files.getLastModifiedTime(file).toInstant().toString()));
            }
            return result;
        }
    }

    @GetMapping("/documents/content")
    public Map<String,String> document(@RequestParam String name) throws Exception {
        Path root=Paths.get(uploadPath).toAbsolutePath().normalize();
        Path file=root.resolve(name).normalize();
        if(!file.getParent().equals(root) || !Files.isRegularFile(file) || !name.toLowerCase().matches(".*\\.(md|markdown|txt)$"))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"文档不存在");
        return Map.of("name",name,"content",Files.readString(file));
    }

    public record KnowledgeRequest(String question, List<Map<String,String>> history, String mode) {}

    @PostMapping(value="/knowledge/stream",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter knowledge(@RequestBody KnowledgeRequest request) {
        if(request.question()==null || request.question().isBlank() || request.question().length()>1000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"问题需为 1–1000 个字符");
        // Accept only a bounded conversation window, and never accept client system prompts.
        List<Map<String,String>> history=new ArrayList<>();
        if(request.history()!=null) for(var message:request.history().stream().skip(Math.max(0,request.history().size()-12)).toList()) {
            String role=message.get("role"),content=message.get("content");
            if (("user".equals(role)||"assistant".equals(role)) && content!=null)
                history.add(Map.of("role",role,"content",content.substring(0,Math.min(content.length(),16000))));
        }
        SseEmitter emitter=new SseEmitter(240000L);
        FutureTask<Void> task=new FutureTask<>(() -> {
            RagService.StreamCallback callback = new RagService.StreamCallback() {
                private void send(String type,Object data) {
                    try {emitter.send(SseEmitter.event().data(Map.of("type",type,"data",data),MediaType.APPLICATION_JSON));}
                    catch(Exception error){
                        // Browser cancellation while streaming is expected during navigation or retry.
                        CancellationException cancelled=new CancellationException("SSE client disconnected");
                        cancelled.initCause(error);
                        throw cancelled;
                    }
                }
                public void onSearchResults(List<VectorSearchService.SearchResult> results){send("sources",results);}
                public void onReasoningChunk(String chunk){}
                public void onContentChunk(String chunk){send("content",chunk);}
                public void onComplete(String answer,String reasoning){send("done",answer);emitter.complete();}
                public void onError(Exception error){try{send("error","知识问答失败，请检查模型与向量服务后重试。");}finally{emitter.complete();}}
            };
            if ("general".equalsIgnoreCase(request.mode())) {
                rag.queryGeneralStream(request.question(),history,callback);
            } else {
                rag.queryStream(request.question(),history,callback);
            }
            return null;
        });
        emitter.onCompletion(() -> task.cancel(true));
        emitter.onTimeout(() -> task.cancel(true));
        emitter.onError(error -> task.cancel(true));
        new Thread(task,"platform-rag").start();
        return emitter;
    }
}
