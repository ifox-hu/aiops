# AIOps 智能运维与知识助手平台

面向值班与故障处置场景的 AIOps 工作台。项目提供值班总览、故障深挖与交接、知识助手三条主要工作流，同时保留 Java / Spring Boot 后端源码和一套无需后端即可运行的 GitHub Pages 静态演示。

- 在线演示：<https://ifox-hu.github.io/superbizagent-aiops/>
- GitHub 仓库：<https://github.com/ifox-hu/superbizagent-aiops>
- 技术栈：Java 17、Spring Boot 3.2、Spring AI、原生 HTML/CSS/JavaScript
- 在线演示使用浏览器内 Mock API，不连接模型、Milvus、Prometheus 或任何生产系统
- 本仓库保留原项目 Apache-2.0 许可证；已有 Agent、RAG 与运维编排能力来自 SuperBizAgent 上游项目

> 本项目是学习与二次开发实践，不代表生产级监控或自动变更系统。告警、日志和静态问答均为演示数据，诊断结果只作为排查建议。

## 在线演示

打开 <https://ifox-hu.github.io/superbizagent-aiops/> 可直接体验：

| 页面 | 主要能力 |
| --- | --- |
| 值班总览 | 活动告警队列、持续时间筛选、同屏诊断、日志、知识依据、告警上下文追问 |
| 故障深挖与交接 | 告警事实、候选原因、证据链、处理记录、交接备注、Markdown 报告导出 |
| 知识助手 | 知识库优先与通用问答双模式、召回来源、文档筛选与查看、浏览器本地会话 |

静态页面的接口由 [`docs/mock-api.js`](docs/mock-api.js) 在浏览器内拦截并返回 Mock 数据。页面不会发起真实后端请求，也不会执行任何系统变更。

## 界面预览

### 值班总览

![值班总览](deployment/v2-previews/v2-desktop-1440x1080.png)

### 故障深挖与交接

![故障深挖与交接](deployment/v2-previews/incident-v2-desktop-1440x1080.png)

### 知识助手

![知识助手](deployment/v2-previews/knowledge-v2-desktop-1440x1080.png)

## 功能范围

### 值班总览

- 读取活动告警并按持续时间排序。
- 支持全部、超过 20 分钟、15 分钟内等筛选条件。
- 在同一个工作区内查看告警事实、候选原因、日志和知识文档。
- 调用 Agent 诊断接口，流式展示 Markdown 诊断报告。
- 带着当前告警上下文向值班助手追问。
- 将选中告警传给故障深挖页面。

### 故障深挖与交接

- 展示告警来源、服务、实例、命名空间、持续时间和原始描述。
- 将观测事实、候选原因和待验证项分开呈现。
- 查询关联日志与知识依据。
- 记录处理动作并维护交接备注。
- 导出包含故障事实、诊断报告、知识依据和处理记录的 Markdown 文件。

### 知识助手

- **知识库优先**：先检索知识库，再结合召回片段回答，并展示实际召回来源。
- **通用问答**：不检索知识库，直接根据模型已有知识回答。
- 支持文档列表、文件名筛选和内容查看。
- 支持上传 `.md`、`.markdown`、`.txt` 文件。静态演示中上传会返回 Mock 成功结果。
- 会话和历史保存在浏览器 `localStorage`，不上传服务器。

## 在线静态版与本地完整版

| 项目 | GitHub Pages 静态版 | 本地完整版 |
| --- | --- | --- |
| 运行方式 | 浏览器直接打开 `docs/` 页面 | Spring Boot 服务 |
| 告警与日志 | 浏览器内 Mock | 后端 Mock 或 Prometheus/CLS 适配 |
| 诊断与问答 | 浏览器内流式 Mock | Agent、模型服务与知识库 |
| 向量检索 | Mock 召回片段 | Ollama bge-m3 + Milvus |
| 文档上传 | 返回模拟结果 | 切片、向量化并写入 Milvus |
| 适用场景 | GitHub Pages 展示、交互演示 | 本机开发、联调和真实链路验证 |

静态版不依赖本地 Java、Docker、Node 服务或模型 API。它适合作为公开演示和界面验收入口；完整后端能力仍需在本机按后文部署。

## Pages 静态版结构

```text
docs/
├── .nojekyll
├── index.html
├── mock-api.js
├── workbench-v2.html
├── workbench-v2.css
├── workbench-v2.js
├── incident-v2.html
├── incident-v2.css
├── incident-v2.js
├── knowledge-v2.html
├── knowledge-v2.css
└── knowledge-v2.js
```

### Mock 接口

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/platform/alerts` | GET | 返回活动告警 |
| `/api/platform/documents` | GET | 返回知识文档列表 |
| `/api/platform/documents/content` | GET | 返回指定文档内容 |
| `/api/platform/logs` | GET | 返回主题相关日志 |
| `/api/upload` | POST | 模拟上传成功 |
| `/api/platform/knowledge/stream` | POST | 流式返回召回来源和问答内容 |
| `/api/chat_stream` | POST | 流式返回诊断报告 |

`mock-api.js` 只拦截路径中包含 `/api/` 的请求；普通静态资源继续由 Pages 提供服务。未实现的接口会返回 `404` 和明确的 Mock API 错误信息。

## 本地预览静态版

不需要 Maven 或 Java。任选一种静态服务器：

### Node.js

```powershell
npx --yes serve docs
```

### Python

```powershell
python -m http.server 8080 -d docs
```

然后打开 `http://localhost:3000/` 或 `http://localhost:8080/`。建议使用静态服务器而不是直接双击 HTML，以便浏览器正确处理相对路径和流式响应。

## 本地运行完整版

完整版需要 Java 17、Maven、Docker Desktop，以及可选的 Ollama。当前本地配置使用 OpenAI 兼容中转模型 `deepseek-flash`、Ollama `bge-m3` 和 Milvus。

### 1. 配置模型密钥

不要把真实密钥写入仓库。启动脚本按以下顺序读取中转密钥：

1. 当前会话环境变量 `RELAY_API_KEY`
2. Windows 用户环境变量 `RELAY_API_KEY`
3. 本机加密文件 `D:\tools\superbizagent-config\apigoto-key.xml`

设置当前会话环境变量：

```powershell
$env:RELAY_API_KEY = '<your-api-key>'
```

### 2. 一键启动

```powershell
Set-Location 'D:\oncall\SuperBizAgent-release-2026-01-02\SuperBizAgent-release-2026-01-02'
powershell -ExecutionPolicy Bypass -File .\deployment\start-local.ps1
```

常用参数：

```powershell
# 先重新构建再启动
powershell -ExecutionPolicy Bypass -File .\deployment\start-local.ps1 -Build

# 只启动 Milvus、etcd、MinIO 和 Attu
powershell -ExecutionPolicy Bypass -File .\deployment\start-local.ps1 -DatabaseOnly

# 停止本项目的 Java、数据库容器和向量服务
powershell -ExecutionPolicy Bypass -File .\deployment\stop-local.ps1
```

启动完成后访问：

| 服务 | 地址 |
| --- | --- |
| 工作台 | <http://localhost:9900/> |
| 故障深挖 | <http://localhost:9900/designs/incident-v2.html> |
| 知识助手 | <http://localhost:9900/designs/knowledge-v2.html> |
| Milvus 健康检查 | <http://127.0.0.1:9900/milvus/health> |
| Attu | <http://localhost:8000> |
| MinIO Console | <http://localhost:9001> |

### 3. 构建

```powershell
mvn -s .\deployment\maven-settings.xml -B -ntp package
```

生成文件：

```text
target/super-biz-agent-1.0-SNAPSHOT.jar
```

本地部署的详细配置、数据目录和限制见 [`deployment/部署说明.md`](deployment/部署说明.md)。

## 测试与回归

### 静态 Pages 回归

该脚本会在本机启动临时静态服务器，并使用无头 Edge 检查三个页面、Mock 数据、日志和流式响应：

```powershell
node .\deployment\check-pages-static.cjs
```

### JavaScript 语法检查

```powershell
node --check .\docs\mock-api.js
node --check .\docs\workbench-v2.js
node --check .\docs\incident-v2.js
node --check .\docs\knowledge-v2.js
```

### 完整后端页面回归

完整版运行在 `http://localhost:9900` 时，可执行：

```powershell
node .\deployment\check-v2-suite.cjs
node .\deployment\check-v2-knowledge-general.cjs
```

项目当前没有 Maven 自动化测试；上述脚本为浏览器级回归，需要本机安装 Edge。

## GitHub Pages 部署

仓库使用 GitHub Actions 部署静态站点：

1. 将改动推送到 `main` 分支。
2. 工作流 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 检出仓库。
3. 将 `docs/` 作为 Pages artifact 上传。
4. 通过 `actions/deploy-pages` 发布。

首次启用时，在仓库 `Settings > Pages` 中将 Source 设为 **GitHub Actions**。后续每次推送到 `main` 都会自动重新部署。也可以手动触发 `Deploy GitHub Pages` 工作流。

## 项目结构

```text
.
├── .github/workflows/pages.yml      # GitHub Pages 自动部署
├── aiops-docs/                      # 运维知识文档
├── deployment/                      # 本地部署、预览和浏览器回归脚本
├── docs/                            # GitHub Pages 静态站点
├── src/main/java/org/example/       # Spring Boot 后端
├── src/main/resources/static/       # 完整版前端资源
├── pom.xml                          # Maven 构建
├── vector-database.yml              # Milvus 向量数据库配置
└── LICENSE                          # Apache-2.0
```

## 安全与边界

- 不要提交 `RELAY_API_KEY`、`DASHSCOPE_API_KEY`、GitHub Token、真实日志中的凭据或任何生产数据。
- `deployment/application-local.yml` 只保留环境变量占位符，不保存明文密钥。
- GitHub Pages 静态版只使用 Mock 数据，不会访问任何内部服务。
- 完整版的告警和日志默认使用模拟数据；在未配置真实 Prometheus 和 CLS 前，不应表述为已接入生产监控。
- Agent 诊断只生成排查建议，不自动执行扩容、回滚、重启或配置变更。
- 知识库召回来源不等同于答案全部引用内容；L2 距离不等于可信度。
- 浏览器本地会话和交接记录不会同步到服务端。

## 上游与许可证

本项目基于 SuperBizAgent 进行二次开发与学习实践，原有 Agent、RAG 和 AIOps 编排能力来自上游项目。仓库保留原 Apache-2.0 许可证和来源说明，新增页面、静态演示与本地适配不表示整个系统从零原创。

许可证全文见 [`LICENSE`](LICENSE)。