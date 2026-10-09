package org.example.service;

import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;
import io.reactivex.Flowable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;

/**
 * RAG (Retrieval-Augmented Generation) 服务
 * 结合向量检索和大语言模型生成答案
 */
@Service
public class RagService {

    private static final Logger logger = LoggerFactory.getLogger(RagService.class);

    @Autowired
    private VectorSearchService vectorSearchService;

    @Value("${dashscope.api.key}")
    private String apiKey;

    @Value("${rag.top-k:3}")
    private int topK;

    @Value("${rag.model:qwen3-30b-a3b-thinking-2507}")
    private String model;

    private Generation generation;

    @Value("${ai.provider:dashscope}")
    private String provider;

    @Autowired
    private ChatService chatService;

    @PostConstruct
    public void init() {
        if ("openai".equalsIgnoreCase(provider)) {
            logger.info("RAG 使用 OpenAI 兼容聊天中转");
            return;
        }
        // 设置 API Key 和 Base URL
        Constants.apiKey = apiKey;
        Constants.baseHttpApiUrl = "https://dashscope.aliyuncs.com/api/v1";
        
        // 创建 Generation 实例
        generation = new Generation();
        
        logger.info("RAG 服务初始化完成，model: {}, topK: {}", model, topK);
    }

    /**
     * 流式处理用户问题（不带历史消息）
     * 
     * @param question 用户问题
     * @param callback 流式回调接口
     */
    public void queryStream(String question, StreamCallback callback) {
        queryStream(question, new ArrayList<>(), callback);
    }

    /**
     * 流式处理用户问题（带历史消息）
     * 
     * @param question 用户问题
     * @param history 历史消息列表，格式：[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
     * @param callback 流式回调接口
     */
    public void queryStream(String question, List<Map<String, String>> history, StreamCallback callback) {
        try {
            logger.info("收到 RAG 流式查询: {}", question);

            // 1. 从向量数据库检索相关文档
            List<VectorSearchService.SearchResult> searchResults = 
                vectorSearchService.searchSimilarDocuments(question, topK);

            // 发送检索结果
            callback.onSearchResults(searchResults);

            // 2. 构建上下文和提示词
            // 知识库优先不等同于只能用知识库：资料不足时允许用通用知识补充，
            // 避免用户问通用问题时被固定话术挡住。
            String prompt = searchResults.isEmpty()
                    ? buildGeneralFallbackPrompt(question)
                    : buildPrompt(question, buildContext(searchResults));

            // 3. 流式调用大语言模型（传入历史消息）
            generateAnswerStream(prompt, history, callback);

        } catch (Exception e) {
            if (isCancellation(e)) {
                logger.info("RAG 流式查询已取消（客户端断开或任务取消）");
                return;
            }
            logger.error("RAG 流式查询失败", e);
            callback.onError(e);
        }
    }

    /**
     * 通用问答：跳过知识库检索，直接调用聊天模型。
     */
    public void queryGeneralStream(String question, List<Map<String, String>> history, StreamCallback callback) {
        try {
            logger.info("收到通用模型流式查询: {}", question);
            callback.onSearchResults(new ArrayList<>());
            String prompt = "你是一个通用 AI 助手。请直接回答用户问题；可以结合对话历史理解上下文。"
                    + "如果问题要求实时信息或你无法确认事实，请明确说明不确定性，不要编造。"
                    + "\n\n用户问题：" + question;
            generateAnswerStream(prompt, history, callback);
        } catch (Exception e) {
            if (isCancellation(e)) {
                logger.info("通用模型流式查询已取消（客户端断开或任务取消）");
                return;
            }
            logger.error("通用模型流式查询失败", e);
            callback.onError(e);
        }
    }

    private boolean isCancellation(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof InterruptedException || current instanceof CancellationException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    /**
     * 构建上下文
     */
    private String buildContext(List<VectorSearchService.SearchResult> searchResults) {
        StringBuilder context = new StringBuilder();
        
        for (int i = 0; i < searchResults.size(); i++) {
            VectorSearchService.SearchResult result = searchResults.get(i);
            context.append("【参考资料 ").append(i + 1).append("】\n");
            context.append(result.getContent()).append("\n\n");
        }
        
        return context.toString();
    }

    /**
     * 构建提示词：资料优先，但允许在资料不足时用通用知识补充。
     */
    private String buildPrompt(String question, String context) {
        return String.format(
            "你是一个专业的AI助手。请优先依据以下参考资料回答用户的问题。\n\n" +
            "参考资料：\n%s\n" +
            "用户问题：%s\n\n" +
            "回答要求：\n" +
            "1. 如果参考资料能够直接回答该问题，请以资料为准，给出准确、详细的回答，并说明依据来自参考资料。\n" +
            "2. 如果参考资料与该问题无关或不足以回答，请直接使用通用知识回答，" +
            "并在开头注明“知识库中没有检索到直接相关资料，以下内容来自通用知识”。\n" +
            "3. 不要因为资料不足而拒绝回答；不要把参考资料中没有的信息说成来自资料。\n",
            context, question
        );
    }

    /**
     * 构建提示词：知识库未命中时自动回退到通用知识。
     */
    private String buildGeneralFallbackPrompt(String question) {
        return "知识库中没有检索到与该问题相关的资料。请直接使用你的通用知识回答用户问题，"
                + "并在回答开头用一句话说明“知识库未命中，以下内容来自通用知识”。"
                + "如果问题涉及实时信息或你无法确认的事实，请明确说明不确定性，不要编造。"
                + "\n\n用户问题：" + question;
    }

    /**
     * 生成答案（流式）
     * 
     * @param prompt 当前问题的提示词
     * @param history 历史消息列表
     * @param callback 流式回调接口
     */
    private void generateAnswerStream(String prompt, List<Map<String, String>> history, StreamCallback callback) 
            throws NoApiKeyException, ApiException, InputRequiredException {
        if ("openai".equalsIgnoreCase(provider)) {
            List<org.springframework.ai.chat.messages.Message> chatMessages = new ArrayList<>();
            for (Map<String, String> message : history) {
                if ("user".equals(message.get("role"))) {
                    chatMessages.add(new org.springframework.ai.chat.messages.UserMessage(message.get("content")));
                } else if ("assistant".equals(message.get("role"))) {
                    chatMessages.add(new org.springframework.ai.chat.messages.AssistantMessage(message.get("content")));
                }
            }
            chatMessages.add(new org.springframework.ai.chat.messages.UserMessage(prompt));
            StringBuilder answer = new StringBuilder();
            chatService.createStandardChatModel()
                    .stream(new org.springframework.ai.chat.prompt.Prompt(chatMessages))
                    .doOnNext(response -> {
                        if (response.getResult() != null && response.getResult().getOutput().getText() != null) {
                            String chunk = response.getResult().getOutput().getText();
                            answer.append(chunk);
                            callback.onContentChunk(chunk);
                        }
                    }).blockLast();
            callback.onComplete(answer.toString(), "");
            return;
        }
        
        // 构建消息列表：历史消息 + 当前问题
        List<Message> messages = new ArrayList<>();
        
        // 添加历史消息
        for (Map<String, String> historyMsg : history) {
            String role = historyMsg.get("role");
            String content = historyMsg.get("content");
            
            if ("user".equals(role)) {
                messages.add(Message.builder()
                        .role(Role.USER.getValue())
                        .content(content)
                        .build());
            } else if ("assistant".equals(role)) {
                messages.add(Message.builder()
                        .role(Role.ASSISTANT.getValue())
                        .content(content)
                        .build());
            }
        }
        
        // 添加当前用户问题
        Message userMsg = Message.builder()
                .role(Role.USER.getValue())
                .content(prompt)
                .build();
        messages.add(userMsg);
        
        logger.debug("发送给AI模型的消息数量: {}（包含 {} 条历史消息）", 
            messages.size(), history.size());

        GenerationParam param = GenerationParam.builder()
                .apiKey(apiKey)
                .model(model)
                .incrementalOutput(true)
                .resultFormat("message")
                .messages(messages)
                .build();

        logger.info("开始调用AI模型流式接口...");
        
        Flowable<GenerationResult> result = generation.streamCall(param);
        
        StringBuilder reasoningContent = new StringBuilder();
        StringBuilder finalContent = new StringBuilder();
        
        logger.info("开始接收AI模型流式响应...");

        result.blockingForEach(message -> {
            if (message.getOutput() != null && 
                message.getOutput().getChoices() != null && 
                !message.getOutput().getChoices().isEmpty()) {
                
                // 获取消息内容
                // 注意：qwen3-30b-a3b-thinking-2507 模型会在 content 中返回完整内容
                // reasoning 部分可能需要通过特殊方式提取或者直接包含在 content 中
                String content = message.getOutput().getChoices().get(0).getMessage().getContent();

                if (content != null && !content.isEmpty()) {
                    logger.debug("收到AI模型内容块: {}", content);
                    
                    // 对于 thinking 模型，content 可能包含思考过程和最终答案
                    // 这里我们将所有内容都作为答案返回
                    finalContent.append(content);
                    callback.onContentChunk(content);
                    
                    logger.debug("已调用 onContentChunk 回调");
                } else {
                    logger.debug("收到空内容块，跳过");
                }
            }
        });
        
        logger.info("AI模型流式响应完成，总内容长度: {}", finalContent.length());

        callback.onComplete(finalContent.toString(), reasoningContent.toString());
        logger.info("已调用 onComplete 回调");
    }

    /**
     * 流式回调接口
     */
    public interface StreamCallback {
        void onSearchResults(List<VectorSearchService.SearchResult> results);
        void onReasoningChunk(String chunk);
        void onContentChunk(String chunk);
        void onComplete(String fullContent, String fullReasoning);
        void onError(Exception e);
    }
}
