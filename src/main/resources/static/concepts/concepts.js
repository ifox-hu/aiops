(function () {
  var toastTimer;

  function toast(message) {
    var existing = document.querySelector(".concept-toast");
    if (existing) existing.remove();
    var node = document.createElement("div");
    node.className = "concept-toast";
    node.setAttribute("role", "status");
    node.textContent = message;
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.remove();
    }, 2400);
  }

  function initSignal() {
    var tracks = Array.prototype.slice.call(document.querySelectorAll(".signal-track"));
    if (!tracks.length) return;

    var details = {
      orders: {
        title: "订单服务响应延迟升高",
        lead: "P95 从 640ms 升至 1.82s，错误率同步抬升。订单写入链路已受影响。",
        source: "order-api",
        time: "22:18:14",
        link: "连接池等待时间升高",
        confidence: "78%",
        steps: [["done", "拉取最近异常日志", "00:08"], ["done", "对齐订单与数据库指标", "00:19"], ["active", "确认慢 SQL 与锁等待", "进行中"], ["", "执行安全回滚或限流", "待确认"]]
      },
      pool: {
        title: "数据库连接池等待时间升高",
        lead: "等待时间从 300ms 升至 842ms，连接池已接近饱和，但暂未发现连接泄漏。",
        source: "mysql-prod",
        time: "22:19:02",
        link: "订单服务响应延迟升高",
        confidence: "84%",
        steps: [["done", "检查连接池活跃连接", "00:06"], ["done", "确认连接数没有泄漏", "00:14"], ["active", "关联慢查询日志", "进行中"], ["", "验证执行计划", "待确认"]]
      },
      sql: {
        title: "慢 SQL 与连接池超时",
        lead: "订单明细查询的平均扫描行数从 12k 升至 480k，执行时间达到 2.4s。",
        source: "mysql-prod",
        time: "22:20:37",
        link: "慢 SQL 分析与优化",
        confidence: "91%",
        steps: [["done", "提取慢查询指纹", "00:05"], ["done", "对齐扫描行数变化", "00:12"], ["active", "获取只读副本执行计划", "进行中"], ["", "评估索引调整方案", "待确认"]]
      },
      gateway: {
        title: "网关错误率回归基线",
        lead: "网关 5xx 保持在 0.21%，过去 7 天同时段基线一致。当前不需要从这里继续排查。",
        source: "edge-gateway",
        time: "22:21:10",
        link: "订单域主链路",
        confidence: "96%",
        steps: [["done", "确认 5xx 指标", "00:04"], ["done", "对比历史基线", "00:09"], ["done", "确认外部依赖稳定", "00:16"], ["", "无需继续处置", "已关闭"]]
      }
    };

    function selectTrack(track) {
      var key = track.getAttribute("data-signal");
      var data = details[key];
      if (!data) return;
      tracks.forEach(function (item) {
        item.classList.toggle("selected", item === track);
      });
      document.querySelector("[data-focus-title]").textContent = data.title;
      document.querySelector("[data-focus-lead]").textContent = data.lead;
      document.querySelector("[data-focus-source]").textContent = data.source;
      document.querySelector("[data-focus-time]").textContent = data.time;
      document.querySelector("[data-focus-link]").textContent = data.link;
      document.querySelector("[data-focus-confidence]").textContent = data.confidence;
      var run = document.querySelector(".signal-run");
      if (run) {
        run.querySelectorAll(".signal-run-line").forEach(function (line, index) {
          var step = data.steps[index];
          if (!step) return;
          line.className = "signal-run-line" + (step[0] ? " " + step[0] : "");
          line.children[1].textContent = step[1];
          line.children[2].textContent = step[2];
        });
      }
    }

    tracks.forEach(function (track) {
      track.addEventListener("click", function () {
        selectTrack(track);
      });
    });

    document.querySelectorAll(".signal-filter").forEach(function (filter) {
      filter.addEventListener("click", function () {
        document.querySelectorAll(".signal-filter").forEach(function (item) {
          item.classList.toggle("active", item === filter);
          item.setAttribute("aria-pressed", item === filter ? "true" : "false");
        });
      });
    });

    document.querySelectorAll("[data-signal-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-signal-action");
        if (action === "claim") {
          button.textContent = "已领取";
          button.disabled = true;
          toast("已将当前信号分配给你");
        } else {
          toast("该信号已静音 15 分钟");
        }
      });
    });

    var command = document.querySelector("#signal-command");
    if (command) {
      command.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" || !command.value.trim()) return;
        toast("已创建诊断任务 · " + command.value.trim());
        command.value = "";
      });
    }

    var clock = document.querySelector(".signal-clock");
    if (clock) {
      var tick = function () {
        var now = new Date();
        clock.innerHTML = now.toLocaleDateString("zh-CN") + "<br>" + now.toLocaleTimeString("zh-CN", { hour12: false }) + " CST";
      };
      tick();
      setInterval(tick, 1000);
    }
  }

  function initCasebook() {
    var navButtons = Array.prototype.slice.call(document.querySelectorAll(".casebook-nav-button"));
    if (!navButtons.length) return;

    navButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.getElementById(button.getAttribute("data-case-target"));
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        navButtons.forEach(function (item) {
          item.classList.toggle("active", item === button);
        });
      });
    });

    document.querySelectorAll(".casebook-exhibit").forEach(function (exhibit) {
      exhibit.addEventListener("click", function () {
        exhibit.classList.toggle("expanded");
      });
    });
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function initAtlas() {
    var thread = document.querySelector("[data-atlas-thread]");
    var form = document.querySelector("[data-atlas-form]");
    if (!thread || !form) return;

    var textarea = form.querySelector("textarea");
    var trace = document.querySelector("[data-atlas-trace]");
    var nodeDetails = {
      pool: ["连接池等待", "当前问题的主症状。命中 3 篇文档，与慢 SQL 形成强关联。"],
      latency: ["订单延迟", "入口指标先确认边界：P95、错误率和吞吐是否同步变化。"],
      sql: ["慢 SQL", "与连接池等待共现。重点检查扫描行数、执行时间和执行计划。"],
      index: ["索引计划", "待验证假设：查询是否因数据分布变化而没有走预期索引。"],
      cache: ["缓存击穿", "当前检索未命中该假设，但保留为待排除项。"]
    };

    document.querySelectorAll(".atlas-mode button").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".atlas-mode button").forEach(function (item) {
          item.classList.toggle("active", item === button);
        });
        toast("已切换到" + button.textContent + "模式");
      });
    });

    document.querySelectorAll(".atlas-prompt").forEach(function (prompt) {
      prompt.addEventListener("click", function () {
        textarea.value = prompt.getAttribute("data-atlas-prompt") || prompt.textContent;
        textarea.focus();
      });
    });

    document.querySelectorAll(".atlas-node").forEach(function (node) {
      function selectNode() {
        var detail = nodeDetails[node.getAttribute("data-atlas-node")];
        if (!detail) return;
        document.querySelectorAll(".atlas-node").forEach(function (item) {
          item.classList.toggle("selected", item === node);
        });
        var label = document.querySelector("[data-atlas-label]");
        label.innerHTML = "<strong>" + escapeHtml(detail[0]) + "</strong><p>" + escapeHtml(detail[1]) + "</p>";
      }
      node.addEventListener("click", selectNode);
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode();
        }
      });
    });

    document.querySelectorAll(".atlas-source").forEach(function (source) {
      source.addEventListener("click", function () {
        toast("已打开引用来源 · " + source.querySelector("strong").textContent);
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var question = textarea.value.trim();
      if (!question) {
        toast("请先输入一个问题");
        textarea.focus();
        return;
      }

      var questionNode = document.createElement("p");
      questionNode.className = "atlas-question";
      questionNode.textContent = question;
      thread.appendChild(questionNode);

      var answer = document.createElement("article");
      answer.className = "atlas-answer";
      answer.innerHTML = "<h2>正在沿证据链寻找答案。</h2><p>这条问题是模拟交互：真实版本会接入知识库检索，并把命中的文档、片段与置信度同步到右侧星图。</p><ol><li>先对齐症状指标与时间窗口<span class=\"atlas-citation\">M-01</span></li><li>再检查依赖侧等待与慢查询指纹<span class=\"atlas-citation\">D-02</span></li><li>最后验证执行计划和索引状态<span class=\"atlas-citation\">S-03</span></li></ol>";
      thread.appendChild(answer);
      thread.scrollTop = thread.scrollHeight;
      textarea.value = "";

      if (trace) {
        trace.innerHTML = "<span class=\"hit\">Query 理解 / hit</span><span class=\"hit\">语义召回 / 3 docs</span><span class=\"hit\">引用校验 / pass</span><span>交叉验证 / related</span>";
      }
      toast("已更新模拟检索结果");
    });
  }

  initSignal();
  initCasebook();
  initAtlas();
})();