---
description: "AkashXDB Cognate 能力的软件包目录。"
kind: "package-group"
---

# cognate/ — AkashXDB Cognate 能力

[English](README.md) | 中文

## 摘要

`cognate/` 软件包将原生 Harness Agent 连接到 AkashXDB。服务负责 Provider 选择、SQL 分类、外部操作策略、结果限制和有界语义上下文；MySQL Provider 使用 AkashXDB MySQL 协议；工具 Consumer 提供 `run_sql` 和确定性的 `render_chart`。

## 目录

- [软件包](#packages)
- [相关文档](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## 软件包

| 软件包 | 作用 | ctx key |
|---|---|---|
| [`cognate/`](cognate/README.zh.md) | Provider 注册、SQL 策略、结果限制和语义上下文服务 | `ctx.cognate` |
| [`cognate-mysql/`](cognate-mysql/README.zh.md) | 直接 MySQL 协议 Provider | 注册到 `ctx.cognate` |
| [`cognate-local/`](cognate-local/README.zh.md) | 面向开发和测试的离线 Markdown 知识 Provider | 注册到 `ctx.cognate` |
| [`tool-cognate/`](tool-cognate/README.zh.md) | `run_sql`、`render_chart` 以及 Cognate 提示词和上下文 | `ctx.tools` |

<a id="related-documentation"></a>
## 相关文档

- [Cognate 子系统](../../docs/subsystems/cognate.zh.md)
- [Agent preset 参考](../preset/agent-presets/README.zh.md)

## Dev Note

<details>
<summary>维护者工作上下文</summary>

Cognate SQL 的读取路径不使用原始 MCP 写入接口。认知 SQL 被分类为外部操作，因为 AkashXDB UDF 可能调用 HTTP 服务、Worker、Redis、存储或 LLM Provider。

</details>
